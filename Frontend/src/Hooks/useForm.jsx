import React from 'react';

const types = {
  email: {
    regex:
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
    message: 'Preencha um email válido',
  },
  password: {
    regex: /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])[0-9a-zA-Z]{8,}$/,
    message:
      'A senha precisa ter 1 caracter maiúsculo, 1 minúsculo e 1 dígito. Mínimo de 8 caracteres.',
  },
};

const useForm = (type, required = false) => {
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState(null);

  function validate(currentValue) {
    // campo não obrigatório
    if (!required && currentValue.length === 0) {
      setError(null);
      return true;
    }

    // campo obrigatório vazio
    if (required && currentValue.length === 0) {
      setError('Campo obrigatório');
      return false;
    }

    // validação por tipo
    if (type && types[type] && !types[type].regex.test(currentValue)) {
      setError(types[type].message);
      return false;
    }

    setError(null);
    return true;
  }

  function onChange({ target }) {
    const newValue = target.value;
    setValue(newValue);
    if (error) validate(newValue);
  }

  function onBlur() {
    validate(value);
  }

  function reset() {
    setValue('');
    setError(null);
  }

  return {
    value,
    setValue,
    onChange,
    onBlur,
    error,
    validate: () => validate(value),
    reset,
  };
};

export default useForm;
