/**
 * Módulo de Calendario
 * ✅ FIX: prevMonth/nextMonth ahora pasan allNoticias al renderizar
 */

import { formatDate, dateToISO, handleError, getElement, sanitize } from './utils.js';

export const calendarState = {
  date: new Date(),
  selectedDate: null,
  noticias: []   // ✅ FIX: guardamos las noticias en el estado del módulo
};

export function initCalendar(allNoticias = []) {
  calendarState.noticias = allNoticias; // ✅ FIX: persistimos los datos

  const featured = allNoticias.find(n => n.destacada || n.fecha === '2026-04-28');
  if (featured) {
    const featuredDate = new Date(featured.fecha);
    calendarState.selectedDate = featuredDate;
    calendarState.date = new Date(featuredDate.getFullYear(), featuredDate.getMonth(), 1);
  }

  const prev = getElement('#calendar-prev');
  const next = getElement('#calendar-next');

  if (prev) prev.addEventListener('click', prevMonth);
  if (next) next.addEventListener('click', nextMonth);

  renderCalendar();
  if (calendarState.selectedDate) {
    showNewsForDate(calendarState.selectedDate);
  }
}

function prevMonth() {
  calendarState.date.setMonth(calendarState.date.getMonth() - 1);
  renderCalendar(); // ✅ FIX: ya no necesita parámetro, usa calendarState.noticias
}

function nextMonth() {
  calendarState.date.setMonth(calendarState.date.getMonth() + 1);
  renderCalendar();
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
        <p>${sanitize(n.texto.substring(0, 120))}...</p>
      </article>
    `).join('');

    results.innerHTML = `<h5>Noticias del ${label}</h5>${cards}`;
  } catch (error) {
    handleError(error, 'showNewsForDate');
  }
}