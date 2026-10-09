/**
 * Módulo de Calendario
 * ✅ FIX: prevMonth/nextMonth ahora pasan allNoticias al renderizar
 */

import { apiFetch, formatDate, dateToISO, handleError, getElement, sanitize } from './utils.js';

export const calendarState = {
  date: new Date(),
  selectedDate: null,
  noticias: []
};
let calendarRequestId = 0;

export function initCalendar(allNoticias = []) {
  calendarState.noticias = allNoticias;

  // Siempre arrancar en el mes actual, no navegar a una noticia antigua
  const now = new Date();
  calendarState.date = new Date(now.getFullYear(), now.getMonth(), 1);
  calendarState.selectedDate = null;

  const prev = getElement('#calendar-prev');
  const next = getElement('#calendar-next');
  if (prev) prev.addEventListener('click', prevMonth);
  if (next) next.addEventListener('click', nextMonth);

  loadCalendarMonth();
}

function prevMonth() {
  calendarState.date.setMonth(calendarState.date.getMonth() - 1);
  calendarState.selectedDate = null;
  loadCalendarMonth();
}

function nextMonth() {
  calendarState.date.setMonth(calendarState.date.getMonth() + 1);
  calendarState.selectedDate = null;
  loadCalendarMonth();
}

async function loadCalendarMonth() {
  const requestId = ++calendarRequestId;
  const month = `${calendarState.date.getFullYear()}-${String(calendarState.date.getMonth() + 1).padStart(2, '0')}`;
  const grid = getElement('#calendar-grid');
  const results = getElement('#calendar-results');
  if (grid) grid.setAttribute('aria-busy', 'true');
  if (results) results.innerHTML = '<h5>Noticias por fecha</h5><div class="sin-noticias" role="status">Cargando noticias del mes…</div>';
  calendarState.noticias = [];
  renderCalendar();

  try {
    const news = await apiFetch(`/noticias/calendario?mes=${encodeURIComponent(month)}`);
    if (requestId !== calendarRequestId) return;
    if (!Array.isArray(news)) throw new Error('La API devolvió un formato de calendario inesperado');
    calendarState.noticias = news.map(noticia => ({
      ...noticia,
      fecha: String(noticia.fecha || '').substring(0, 10)
    }));
    renderCalendar();
    if (calendarState.selectedDate) showNewsForDate(calendarState.selectedDate);
    else if (results) results.innerHTML = '<h5>Noticias por fecha</h5><div class="sin-noticias">Seleccioná un día para ver las noticias de esa fecha.</div>';
  } catch (error) {
    if (requestId !== calendarRequestId) return;
    handleError(error, 'loadCalendarMonth');
    const results = getElement('#calendar-results');
    if (results) {
      results.innerHTML = '<h5>Calendario</h5><div class="sin-noticias" role="alert">No se pudieron cargar las noticias de este mes. <button type="button" id="calendar-retry">Reintentar</button></div>';
      getElement('#calendar-retry')?.addEventListener('click', loadCalendarMonth);
    }
  } finally {
    if (requestId === calendarRequestId && grid) grid.removeAttribute('aria-busy');
  }
}

export function renderCalendar() {
  try {
    const allNoticias = calendarState.noticias; // ✅ FIX: lee del estado
    const calendarTitle = getElement('#calendar-title');
    const calendarGrid = getElement('#calendar-grid');
    if (!calendarTitle || !calendarGrid) return;

    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const dayNames = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    const date = new Date(calendarState.date.getFullYear(), calendarState.date.getMonth(), 1);

    calendarTitle.textContent = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    calendarGrid.innerHTML = '';

    dayNames.forEach(day => {
      const label = document.createElement('div');
      label.className = 'calendar-cell calendar-cell-header';
      label.textContent = day;
      calendarGrid.appendChild(label);
    });

    const firstDayIndex = (date.getDay() + 6) % 7;
    for (let i = 0; i < firstDayIndex; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'calendar-cell calendar-cell-empty';
      calendarGrid.appendChild(emptyCell);
    }

    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const today = new Date();

    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell calendar-day';
      cell.textContent = day;
      cell.role = 'button';
      cell.tabIndex = 0;
      cell.setAttribute('aria-label', `${day} de ${monthNames[date.getMonth()]}`);

      const dayDate = new Date(date.getFullYear(), date.getMonth(), day);
      const dayKey = dateToISO(dayDate);
      const matches = allNoticias.filter(n => n.fecha === dayKey);
      const isToday = day === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
      const isSelected = calendarState.selectedDate &&
        calendarState.selectedDate.getDate() === day &&
        calendarState.selectedDate.getMonth() === date.getMonth() &&
        calendarState.selectedDate.getFullYear() === date.getFullYear();

      if (matches.length > 0) {
        cell.classList.add('calendar-day-has-event');
        cell.title = `${matches.length} noticia${matches.length > 1 ? 's' : ''} programada${matches.length > 1 ? '' : 'a'}`;
      }
      if (isToday) cell.classList.add('calendar-day-today');
      if (isSelected) {
        cell.classList.add('calendar-day-selected');
        cell.setAttribute('aria-current', 'date');
      }

      const clickHandler = () => {
        calendarState.selectedDate = dayDate;
        showNewsForDate(dayDate);
        renderCalendar();
      };

      cell.addEventListener('click', clickHandler);
      cell.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          clickHandler();
        }
      });

      calendarGrid.appendChild(cell);
    }
  } catch (error) {
    handleError(error, 'renderCalendar');
  }
}

export function showNewsForDate(date) {
  try {
    const allNoticias = calendarState.noticias; // ✅ FIX: lee del estado
    const results = getElement('#calendar-results');
    if (!results) return;

    const dateKey = dateToISO(date);
    const matches = allNoticias.filter(n => n.fecha === dateKey);
    const label = formatDate(date);

    if (matches.length === 0) {
      results.innerHTML = `<h5>Noticias del ${label}</h5><div class="sin-noticias">No hay noticias publicadas para esta fecha.</div>`;
      return;
    }

    const cards = matches.map(n => `
      <article class="calendar-news-card">
        <h6>${sanitize(n.titulo)}</h6>
        <p>${sanitize(n.descripcion || n.texto || '').substring(0, 120)}…</p>
      </article>
    `).join('');

    results.innerHTML = `<h5>Noticias del ${label}</h5>${cards}`;
  } catch (error) {
    handleError(error, 'showNewsForDate');
  }
}