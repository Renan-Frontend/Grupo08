import json
import os
from typing import Any, Generator, Type

import httpx
from pydantic import BaseModel, ValidationError

from bpmn_assistant.core.enums import OutputMode
from bpmn_assistant.core.llm_provider import LLMProvider


def _get_model_cls(structured_output: Any) -> Type[BaseModel]:
    # structured_output pode ser uma classe Pydantic (mais comum) ou uma instância
    return structured_output if isinstance(structured_output, type) else structured_output.__class__


def _schema_for(model_cls: Type[BaseModel]) -> dict[str, Any]:
    # Pydantic v2
    if hasattr(model_cls, "model_json_schema"):
        return model_cls.model_json_schema()
    # Pydantic v1
    return model_cls.schema()


def _validate_with(model_cls: Type[BaseModel], data: Any) -> BaseModel:
    # Pydantic v2
    if hasattr(model_cls, "model_validate"):
        return model_cls.model_validate(data)
    # Pydantic v1
    return model_cls.parse_obj(data)


class OllamaProvider(LLMProvider):
    def __init__(self, api_key: str = "", output_mode: OutputMode = OutputMode.JSON):
        # api_key não é usado, mas mantemos assinatura compatível com o factory
        self.output_mode = output_mode
        self.base_url = os.getenv("OLLAMA_BASE_URL", "http://172.18.0.1:11434").rstrip("/")
        self.default_model = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
        self._client = httpx.Client(timeout=120)

    def get_initial_messages(self) -> list[dict[str, str]]:
        return (
            [
                {
                    "role": "system",
                    "content": "You are a helpful assistant designed to output JSON.",
                }
            ]
            if self.output_mode == OutputMode.JSON
            else []
        )

    def check_model_compatibility(self, model: str) -> bool:
        # Ollama: nomes dependem dos modelos instalados localmente
        return True

    def _validate_no_images(self, messages: list[dict[str, Any]]) -> None:
        # O projeto usa o formato OpenAI vision: content=[{type:"text"}, {type:"image_url", ...}]
        has_images = any(
            isinstance(msg.get("content"), list)
            and any(item.get("type") == "image_url" for item in msg.get("content", []))
            for msg in messages
        )
        if has_images:
            raise ValueError("OllamaProvider does not support image inputs in this project.")

    def call(
        self,
        model: str,
        messages: list[dict[str, Any]],
        max_tokens: int,
        temperature: float,
        structured_output: BaseModel | None = None,
    ) -> str | dict[str, Any]:
        self._validate_no_images(messages)

        model = model or self.default_model

        # Se estiver em JSON mode, sempre forçamos JSON e retornamos dict
        if self.output_mode == OutputMode.JSON or structured_output is not None:
            schema = None
            model_cls: Type[BaseModel] | None = None

            if structured_output is not None:
                model_cls = _get_model_cls(structured_output)
                schema = _schema_for(model_cls)

            forced_messages = self._force_json_messages(messages, schema)
            text = self._chat(model, forced_messages, max_tokens, temperature)
            data = self._extract_json(text)

            # Se houver schema pydantic, tenta validar (isso ajuda o retry loop)
            if model_cls is not None:
                try:
                    obj = _validate_with(model_cls, data)
                    return obj.model_dump() if hasattr(obj, "model_dump") else obj.dict()
                except ValidationError:
                    return data

            # Sem schema: apenas garantir dict
            if not isinstance(data, dict):
                return {"result": data}
            return data

        # TEXT mode
        return self._chat(model, messages, max_tokens, temperature)

    def stream(
        self,
        model: str,
        messages: list[dict[str, Any]],
        max_tokens: int,
        temperature: float,
    ) -> Generator[str, None, None]:
        self._validate_no_images(messages)

        model = model or self.default_model

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": temperature,
                # "num_predict": max_tokens,  # habilite só se seu Ollama suportar
            },
        }

        with self._client.stream("POST", f"{self.base_url}/api/chat", json=payload) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if not line:
                    continue
                chunk = json.loads(line)
                msg = chunk.get("message") or {}
                token = msg.get("content")
                if token:
                    yield token

    # ---------- helpers ----------

    def _chat(
        self,
        model: str,
        messages: list[dict[str, Any]],
        max_tokens: int,
        temperature: float,
    ) -> str:
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                # "num_predict": max_tokens,  # habilite só se seu Ollama suportar
            },
        }
        r = self._client.post(f"{self.base_url}/api/chat", json=payload)
        r.raise_for_status()
        data = r.json()
        return (data.get("message") or {}).get("content", "")

    def _force_json_messages(
        self,
        messages: list[dict[str, Any]],
        schema: dict[str, Any] | None,
    ) -> list[dict[str, Any]]:
        # Mantém consistente: JSON-only (e opcionalmente com schema)
        schema_text = ""
        if schema is not None:
            schema_text = "\nThe JSON MUST match this JSON Schema:\n" + json.dumps(
                schema, ensure_ascii=False
            )

        system = {
            "role": "system",
            "content": (
                "Return ONLY valid JSON. Do not include markdown, code fences, or extra text."
                + schema_text
            ),
        }

        # coloca o system no início (mesmo se já existirem systems anteriores)
        return [system, *messages]

    def _extract_json(self, text: str) -> Any:
        text = (text or "").strip()

        # parse direto
        try:
            return json.loads(text)
        except Exception:
            pass

        # recorte heurístico
        start_obj = text.find("{")
        start_arr = text.find("[")
        starts = [i for i in (start_obj, start_arr) if i != -1]
        if not starts:
            return {"raw": text}

        start = min(starts)
        candidate = text[start:].strip()

        end_obj = candidate.rfind("}")
        end_arr = candidate.rfind("]")
        end = max(end_obj, end_arr)
        if end != -1:
            candidate = candidate[: end + 1]

        try:
            return json.loads(candidate)
        except Exception:
            return {"raw": text}
