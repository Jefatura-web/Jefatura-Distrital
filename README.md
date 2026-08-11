# Jefatura Distrital Quilmes

Guía única para instalar el proyecto, montar la base de datos y cargar noticias.

## 1. ¿Qué hace este proyecto?

Este sitio web usa Node.js + Express para servir la página y MySQL para guardar noticias.
El contenido de noticias se carga desde la tabla `noticias` y se muestra automáticamente en el sitio y en el calendario.

## 2. Requisitos

- Node.js instalado
- npm instalado
- MySQL instalado y ejecutándose
- Archivo `Base Jefatura.sql` disponible

## 3. Preparar el proyecto

1. Abre una terminal en `c:\Users\Ken\Desktop\Jefatura`
2. Instala dependencias:

```powershell
npm install
```

3. Crea un archivo `.env` en la raíz del proyecto con este contenido:

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=tu_contraseña
DB_NAME=jefatura_db
ADMIN_TOKEN=admin123
```

Cambia `DB_USER`, `DB_PASSWORD` y `DB_NAME` según tu MySQL.

## 4. Crear la base de datos

Usa MySQL para importar el archivo SQL:

```powershell
mysql -u root -p < "Base Jefatura.sql"
```

Si no usas contraseña:

```powershell
mysql -u root < "Base Jefatura.sql"
```

Esto crea las tablas y datos necesarios.

## 5. Iniciar el servidor local

En la misma carpeta del proyecto:

```powershell
npm start
```

Luego abre en el navegador:

```
http://localhost:3000/
```

## 6. Cómo cargar noticias

### Opción A: Usar el botón de la portada

En la página principal hay un botón “Subir noticias”. Al tocarlo, el sistema pide el token de seguridad y solo después abre el panel administrativo.

### Opción B: Usar el panel administrativo directo

Abre:

```
http://localhost:3000/admin.html
```

Completa el formulario y envía la noticia.

### Opción B: Usar el endpoint `POST /noticias`

Envía JSON con `Authorization: Bearer <ADMIN_TOKEN>`.

Ejemplo PowerShell:

```powershell
$body = @{
  titulo = "Noticia de prueba"
  texto = "Texto de prueba"
  categoria_id = 1
  fecha = "2026-06-02"
  imagen_url = "proyecto_distrital.jpg"
  destacada = $true
  publicada = $true
} | ConvertTo-Json

Invoke-WebRequest -Uri http://localhost:3000/noticias `
  -Method POST `
  -Headers @{ 'Content-Type' = 'application/json'; 'Authorization' = 'Bearer admin123' } `
  -Body $body
```

### Campos importantes

- `titulo`: título de la noticia
- `texto`: contenido completo
- `categoria_id`: ID numérica de la categoría
- `fecha`: formato `YYYY-MM-DD`
- `imagen_url`: URL o nombre de imagen
- `destacada`: true/false
- `publicada`: true/false

## 7. Rutas clave del proyecto

- `GET /` → página principal
- `GET /admin.html` → panel administrativo oculto
- `GET /noticias` → obtiene noticias desde MySQL
- `POST /noticias` → crea noticia con token admin

## 8. Dónde subir la página

Esta aplicación necesita un servidor que soporte:

- Node.js
- MySQL o una base de datos MySQL gestionada

Opciones comunes:

- Railway
- Render
- DigitalOcean
- Heroku con MySQL externo

Si solo quieres probar localmente, no necesitas subirla: basta con ejecutar `npm start` y usar `http://localhost:3000/`.

## 9. Comprobaciones necesarias

1. `npm install` se ejecuta bien
2. `.env` está configurado correctamente
3. `Base Jefatura.sql` se importó sin errores
4. `npm start` inicia el servidor
5. `http://localhost:3000/noticias` devuelve un array JSON
6. `http://localhost:3000/admin.html` abre el formulario administrativo

## 10. Problemas comunes

- Si MySQL no arranca, revisa el servicio de MySQL en Windows.
- Si el servidor no contecta, revisa `DB_HOST`, `DB_USER`, `DB_PASSWORD` y `DB_NAME`.
- Si `npm start` falla, ejecuta `npm install` de nuevo.

---

Este es el único documento de guía del proyecto: `README.md`.
