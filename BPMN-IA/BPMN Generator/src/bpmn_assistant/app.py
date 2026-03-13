from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
import os
import httpx
from fastapi import HTTPException


from bpmn_assistant.api.requests import (
    AvailableProvidersRequest,
    BpmnToJsonRequest,
    ConversationalRequest,
    DetermineIntentRequest,
    ModifyBpmnRequest,
)
from bpmn_assistant.core import handle_exceptions
from bpmn_assistant.core.enums import OutputMode
from bpmn_assistant.services import (
    BpmnJsonGenerator,
    BpmnModelingService,
    BpmnXmlGenerator,
    ConversationalService,
    determine_intent,
)
from bpmn_assistant.utils import (
    extract_images_from_message_history,
    get_available_providers,
    get_llm_facade,
    replace_reasoning_model,
)

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "https://bpmn-frontend.onrender.com",
]


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

bpmn_modeling_service = BpmnModelingService()
bpmn_xml_generator = BpmnXmlGenerator()


@app.get("/")
async def health_check():
    return {"status": "ok"}


@app.post("/bpmn_to_json")
@handle_exceptions
async def _bpmn_to_json(request: BpmnToJsonRequest) -> JSONResponse:
    """
    Convert the BPMN XML to its JSON representation
    """
    bpmn_json_generator = BpmnJsonGenerator()
    result = bpmn_json_generator.create_bpmn_json(request.bpmn_xml)
    return JSONResponse(content=result)

@app.get("/ollama_models")
async def _ollama_models():
    base = (os.getenv("OLLAMA_BASE_URL") or "http://host.docker.internal:11434").rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{base}/api/tags")
            r.raise_for_status()
            data = r.json()

        names = [m.get("name") for m in data.get("models", []) if m.get("name")]
        return {"models": names}

    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Ollama not reachable via {base}. Error: {repr(e)}",
        )


@app.post("/available_providers")
@handle_exceptions
async def _available_providers(request: AvailableProvidersRequest) -> JSONResponse:
    """
    Get the available LLM providers
    """
    providers = get_available_providers(api_keys=request.api_keys)
    return JSONResponse(content=providers)


@app.post("/determine_intent")
@handle_exceptions
async def _determine_intent(request: DetermineIntentRequest) -> JSONResponse:
    """
    Determine the intent of the user query
    """
    model = replace_reasoning_model(request.model)
    llm_facade = get_llm_facade(model, api_keys=request.api_keys)
    images = extract_images_from_message_history(request.message_history)
    intent = determine_intent(llm_facade, request.message_history, images=images)
    return JSONResponse(content=intent)


@app.post("/modify")
@handle_exceptions
async def _modify(request: ModifyBpmnRequest) -> JSONResponse:
    """
    Modify the BPMN process based on the user query. If the request does not contain a BPMN JSON,
    then create a new BPMN process. Otherwise, edit the existing BPMN process.
    """
    llm_facade = get_llm_facade(request.model, api_keys=request.api_keys)
    text_llm_facade = get_llm_facade(
        request.model, OutputMode.TEXT, api_keys=request.api_keys
    )
    images = extract_images_from_message_history(request.message_history)

    if request.process:
        process = bpmn_modeling_service.edit_bpmn(
            llm_facade,
            text_llm_facade,
            request.process,
            request.message_history,
            images=images,
        )
    else:
        process = bpmn_modeling_service.create_bpmn(
            llm_facade,
            request.message_history,
            images=images,
        )

    bpmn_xml_string = bpmn_xml_generator.create_bpmn_xml(process)
    return JSONResponse(content={"bpmn_xml": bpmn_xml_string, "bpmn_json": process})


@app.post("/talk")
async def _talk(request: ConversationalRequest) -> StreamingResponse:
    model = replace_reasoning_model(request.model)
    conversational_service = ConversationalService(model, api_keys=request.api_keys)
    images = extract_images_from_message_history(request.message_history)

    if request.needs_to_be_final_comment:
        response_generator = conversational_service.make_final_comment(
            request.message_history, request.process, images=images
        )
    else:
        response_generator = conversational_service.respond_to_query(
            request.message_history, request.process, images=images
        )

    return StreamingResponse(response_generator)
