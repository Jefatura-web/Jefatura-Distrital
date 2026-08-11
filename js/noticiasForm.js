/**
 * Módulo de Formulario de Noticias
 * Maneja creación y edición de noticias con recarga automática
 */

import { getElement, sanitize, handleError, apiFetch } from './utils.js';
import { renderNoticiasList, cargarNoticias, showAppAlert } from './news.js';
import { renderCalendar } from './calendar.js';

export function initNoticiasForm(onSubmitSuccess) {
  const form = getElement('#form-crear-noticia');
  const submitButton = getElement('#form-submit-button');

  if (!form) return;

  form.addEventListener('submit', (e) => enviarFormulario(e, onSubmitSuccess));

  const inputFecha = getElement('#noticia-fecha');
  if (inputFecha) {
    inputFecha.value = new Date().toISOString().split('T')[0];
  }

  if (submitButton) {
    submitButton.textContent = 'Crear noticia';
  }

  resetNoticiaForm(false);
}

function resetNoticiaForm(clearToken = true) {
  const form = getElement('#form-crear-noticia');
  if (!form) return;
  form.reset();
  const inputFecha = getElement('#noticia-fecha');
  if (inputFecha) {
    inputFecha.value = new Date().toISOString().split('T')[0];
  }
  if (clearToken) {
    const tokenInput = getElement('#admin-token');
    if (tokenInput) tokenInput.value = sessionStorage.getItem('jefatura_admin_token') || '';
  }
}

async function enviarFormulario(event, onSubmitSuccess) {
  event.preventDefault();

  const form = getElement('#form-crear-noticia');
  const tokenInput = getElement('#admin-token');
  if (!form) return;

  const formData = new FormData(form);
  const noticiaId = String(formData.get('id') || '').trim();
  const data = {
    titulo: formData.get('titulo'),
    descripcion: formData.get('descripcion'),
    texto: formData.get('texto'),
    categoria_id: parseInt(formData.get('categoria_id'), 10),
    fecha: formData.get('fecha'),
    imagen_url: formData.get('imagen_url'),
    destacada: formData.get('destacada') === 'on',
    publicada: formData.get('publicada') === 'on'
  };

  let tokenRaw = tokenInput?.value.trim() || '';
  if (!tokenRaw) {
    showAppAlert('Debes ingresar el token de administración para continuar.', 'error');
    return;
  }
  const token = tokenRaw.replace(/^Bearer\s+/i, '');

  if (!data.titulo || !data.texto || !data.categoria_id || !data.fecha) {
    showAppAlert('Por favor completa todos los campos requeridos.', 'error');
    return;
  }

  const isUpdate = noticiaId.length > 0;
  const btnSubmit = getElement('#form-submit-button');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = isUpdate ? 'Actualizando...' : 'Creando...';
  }

  try {
    const endpoint = isUpdate ? `/noticias/${encodeURIComponent(noticiaId)}` : '/noticias';
    const method = isUpdate ? 'PUT' : 'POST';
    const result = await apiFetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (result && result.ok) {
      resetNoticiaForm(false);
      if (btnSubmit) btnSubmit.textContent = 'Crear noticia';
      showAppAlert(isUpdate ? '✅ Noticia actualizada exitosamente.' : '✅ Noticia creada exitosamente.', 'success');

      if (typeof onSubmitSuccess === 'function') {
        await onSubmitSuccess();
      } else {
        setTimeout(async () => {
          await cargarNoticias();
          if (typeof renderCalendar === 'function') {
            renderCalendar();
          }
        }, 500);
      }
    } else {
      showAppAlert(result?.error || (isUpdate ? 'Error al actualizar la noticia.' : 'Error al crear la noticia.'), 'error');
    }
  } catch (error) {
    handleError(error, 'enviarFormulario');
    showAppAlert('No se pudo guardar la noticia. Verifica la conexión y el token.', 'error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = isUpdate ? 'Actualizar noticia' : 'Crear noticia';
    }
  }
}
