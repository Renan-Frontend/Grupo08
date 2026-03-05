import React from 'react';

export default function useFormSubmit({ fields, onSubmit }) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [success, setSuccess] = React.useState(false);
  const [touched, setTouched] = React.useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setTouched(true);
    setError(null);
    setSuccess(false);

    const missingFields = [];
    const invalidFields = [];

    Object.entries(fields).forEach(([label, field]) => {
      if (!field.value) {
        missingFields.push(label);
      } else if (field.validate && !field.validate()) {
        invalidFields.push(label);
      }
    });

    let errorMsg = '';

    if (missingFields.length > 0) {
      errorMsg +=
        'Preencha os campos obrigatórios: ' + missingFields.join(', ');
    }

    if (invalidFields.length > 0) {
      if (errorMsg) errorMsg += '. ';
      errorMsg += 'Campos inválidos: ' + invalidFields.join(', ');
    }

    if (errorMsg) {
      setError(errorMsg);
      return;
    }

    setLoading(true);
    try {
      await onSubmit();
      setSuccess(true);
    } catch (err) {
      const message = err?.message || 'Ocorreu um erro. Tente novamente.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function resetFormState() {
    setError(null);
    setSuccess(false);
    setTouched(false);
    setLoading(false);
  }

  return {
    handleSubmit,
    loading,
    error,
    success,
    touched,
    setError,
    setSuccess,
    resetFormState,
  };
}
