import { initNoticiasForm } from './noticiasForm.js';
import { apiFetch, getElement, handleError } from './utils.js';

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function formatDateForPreview(val) {
  if (!val) return '';
  try {
    const d = new Date(val);
    return d.toLocaleDateString('es-AR');
  } catch (e) {
    return val;
  }
}

function initLivePreview() {
  const form = document.getElementById('form-crear-noticia');
  const previewCard = document.getElementById('preview-card');
  if (!form || !previewCard) return;

  const get = (id) => form.querySelector('#' + id);

  function updatePreview() {
    const titulo = get('noticia-titulo')?.value.trim() || 'Tu título aparecerá aquí';
    const descripcion = get('noticia-descripcion')?.value.trim() || '';
    const texto = get('noticia-texto')?.value.trim() || '';
    const fecha = get('noticia-fecha')?.value || '';
    const categoria_id = parseInt(get('noticia-categoria')?.value || '1', 10);
    const destacada = !!get('noticia-destacada')?.checked;
    const publicada = !!get('noticia-publicada')?.checked;
    const imagen_url = get('noticia-imagen')?.value.trim() || '';

    const categoriaMap = {1: 'Comunicado', 2: 'Evento', 3: 'Noticia', 4: 'Institucional', 5: 'Otros'};
    const categoriaNombre = categoriaMap[categoria_id] || 'Sin categoría';
    const colorMap = {1: 'azul', 2: 'dorado', 3: 'verde', 4: 'violeta', 5: 'azul'};
    const color = colorMap[categoria_id] || 'azul';

    const estado = !publicada ? 'Borrador' : (destacada ? '📌 Destacada' : '✅ Publicada');
    const estadoStyle = !publicada ? 'background: #fef3c7; color: #92400e;' : (destacada ? 'background: #dcfce7; color: #166534;' : 'background: #e0f2fe; color: #0c4a6e;');

    const textoPreview = texto ? (texto.length > 150 ? texto.substring(0, 150) + '...' : texto) : 'El contenido de la noticia se mostrará aquí.';

    let imagenHtml = '<div class="pn-imagen-placeholder">🖼️</div>';
    if (imagen_url) {
      imagenHtml = `<img src="${escapeHtml(imagen_url)}" alt="Imagen noticia" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'">`;
    }

    previewCard.innerHTML = `
      <div class="pn-imagen ${color}">${imagenHtml}</div>
      <div class="pn-body">
        <div class="pn-categoria">${escapeHtml(categoriaNombre)}</div>
        <h3 class="pn-titulo">${escapeHtml(titulo)}</h3>
        ${descripcion ? `<p class="pn-descripcion">${escapeHtml(descripcion)}</p>` : '<p class="pn-descripcion">La descripción breve también...</p>'}
        <p class="pn-texto-preview">${escapeHtml(textoPreview)}</p>
        <div class="pn-meta">
          <span class="pn-fecha">📅 ${fecha ? formatDateForPreview(fecha) : 'Sin fecha'}</span>
          <span class="pn-estado" style="${estadoStyle}">${estado}</span>
        </div>
      </div>
    `;
  }

  const inputs = form.querySelectorAll('input, textarea, select');
  inputs.forEach(input => {
    input.addEventListener('input', updatePreview);
    input.addEventListener('change', updatePreview);
  });

  updatePreview();
}

document.addEventListener('DOMContentLoaded', () => {
  const token = sessionStorage.getItem('jefatura_admin_token');
  if (token) {
    const input = document.getElementById('admin-token');
    if (input) input.value = token;
  }

  initLivePreview();
  initNoticiasForm();
});
