/**
 * Módulo de Formulario de Noticias
 * Maneja creación de noticias con recarga automática
 */

import { getElement, sanitize, handleError, safeFetch } from './utils.js';
import { renderNoticiasList, cargarNoticias, showAppAlert } from './news.js';
import { renderCalendar } from './calendar.js';

export function initNoticiasForm() {
  const btnCrear = getElement('#btn-crear-noticia');
  const modal = getElement('#modal-crear-noticia');
  const btnCerrar = getElement('#btn-cerrar-modal');
  const btnCancelar = getElement('#btn-cancelar-noticia');
  const form = getElement('#form-crear-noticia');

  if (!btnCrear || !modal || !form) return;

  // Abrir modal
  btnCrear.addEventListener('click', (e) => {
    e.preventDefault();
    abrirModal(modal);
  });

  // Cerrar modal
  if (btnCerrar) btnCerrar.addEventListener('click', () => cerrarModal(modal));
  if (btnCancelar) btnCancelar.addEventListener('click', () => cerrarModal(modal));

  // Cerrar modal al hacer clic fuera
  modal.addEventListener('click', (e) => {
    if (e.target === modal) cerrarModal(modal);
  });

  // Enviar formulario
  form.addEventListener('submit', (e) => enviarFormulario(e, modal));

  // Establecer fecha actual por defecto
  const inputFecha = getElement('#noticia-fecha');
  if (inputFecha) {
    const today = new Date().toISOString().split('T')[0];
    inputFecha.value = today;
  }
}

function abrirModal(modal) {
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('visible');
  document.body.style.overflow = 'hidden';
  const input = getElement('#noticia-titulo');
  if (input) input.focus();
}

function cerrarModal(modal) {
  modal.setAttribute('aria-hidden', 'true');
  modal.classList.remove('visible');
  document.body.style.overflow = '';
  getElement('#form-crear-noticia').reset();
  const inputFecha = getElement('#noticia-fecha');
  if (inputFecha) {
    const today = new Date().toISOString().split('T')[0];
    inputFecha.value = today;
  }
}

async function enviarFormulario(event, modal) {
  event.preventDefault();

  const form = getElement('#form-crear-noticia');
  const formData = new FormData(form);
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

  // Validación adicional en cliente
  if (!data.titulo || !data.texto || !data.categoria_id || !data.fecha) {
    showAppAlert('Por favor completa todos los campos requeridos.', 'error');
    return;
  }

  try {
    const btnSubmit = getElement('#form-crear-noticia button[type="submit"]');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Creando...';
    }

    const response = await safeFetch('/noticias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (response.ok && response.data) {
      // Cerrar modal
      cerrarModal(modal);

      // Mostrar mensaje de éxito
      showAppAlert('✅ Noticia creada exitosamente. Se actualizará automáticamente.', 'success');

      // Recargar noticias
      setTimeout(async () => {
        await cargarNoticias();
        renderCalendar();
      }, 500);
    } else {
      showAppAlert('Error al crear la noticia. Intenta nuevamente.', 'error');
    }
  } catch (error) {
    handleError(error, 'enviarFormulario');
    showAppAlert('No se pudo crear la noticia. Verifica la conexión.', 'error');
  } finally {
    const btnSubmit = getElement('#form-crear-noticia button[type="submit"]');
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Crear noticia';
    }
  }
}
