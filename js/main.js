/**
 * Punto de entrada del cliente
 * Carga módulos y coordina inicialización
 */

import { cargarNoticias, getAllNoticias } from './news.js';
import { initCalendar } from './calendar.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Aplicación iniciada');
  
  try {
    // Cargar noticias y esperar
    const noticias = await cargarNoticias();
    
    // Inicializar calendario con datos de noticias
    initCalendar(noticias);
    
    console.log(`✅ App lista - ${noticias.length} noticias cargadas`);
  } catch (error) {
    console.error('❌ Error al iniciar la aplicación:', error);
  }
});


