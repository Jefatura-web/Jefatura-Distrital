# Jefatura Distrital Quilmes — Sistema de noticias

Sitio web institucional con panel administrativo para publicar noticias.
Stack: **Node.js + Express** (servidor y API) · **TiDB Serverless** (base de datos) · **Render** (hosting).

---

## Estructura del proyecto

```
/
├── index.html              # Página principal
├── admin.html              # Panel administrativo (acceso con token)
├── css/
│   ├── estilo.css
│   └── admin-styles.css
├── js/
│   ├── server.js           # Entrada del servidor Express
│   ├── server.config.js    # Configuración centralizada
│   ├── noticiasController.js
│   ├── noticiasRoutes.js
│   ├── utils.js            # Utilidades cliente (incluye resolución de API URL)
│   ├── main.js             # Entrada del cliente (página principal)
│   ├── admin.js            # Panel admin (preview + formulario + listado)
│   ├── news.js             # Renderizado de noticias
│   └── calendar.js         # Calendario
├── logo_jefatura.jpg
├── proyecto_distrital.jpg
├── Base_Jefatura.sql       # Schema de la base de datos
├── render.yaml             # Configuración de deploy en Render
├── package.json
└── .env.example
```

---

## 1. Instalación local

```bash
npm install
```

Crear `.env` a partir del ejemplo:

```bash
cp .env.example .env
```

Editar `.env` con los datos de MySQL local (ver sección de variables).

Importar el schema:

```bash
mysql -u root -p < Base_Jefatura.sql
```

Iniciar el servidor:

```bash
npm start
# → http://localhost:3000
```

---

## 2. Variables de entorno

| Variable      | Local (MySQL)       | Producción (TiDB)                              |
|---------------|---------------------|------------------------------------------------|
| `DB_HOST`     | `localhost`         | `gateway01.us-east-1.prod.aws.tidbcloud.com`   |
| `DB_PORT`     | `3306`              | `4000`                                         |
| `DB_USER`     | `root`              | `<prefix>.root`                                |
| `DB_PASSWORD` | (vacío o tu pass)   | Contraseña del cluster TiDB                    |
| `DB_NAME`     | `jefatura_db`       | `jefatura_db`                                  |
| `ADMIN_TOKEN` | cualquier string    | Token seguro (mín. 20 caracteres aleatorios)   |
| `CLOUDINARY_CLOUD_NAME` | — | Nombre de nube de Cloudinary |
| `CLOUDINARY_API_KEY` | — | Clave API de Cloudinary |
| `CLOUDINARY_API_SECRET` | — | Secreto API de Cloudinary |
| `CORS_ORIGIN` | `*`                 | URL de Render: `https://jefatura-quilmes.onrender.com` (varias URLs, separadas por comas) |
| `SITE_URL`    | —                   | URL pública canónica, por ejemplo `https://jefatura-quilmes.onrender.com` |
| `NODE_ENV`    | `development`       | `production`                                   |

El panel cambia el token por una cookie de sesión `HttpOnly`, `Secure` en producción y `SameSite=Strict`. La sesión vence a las dos horas y se invalida al cerrar sesión o al reiniciarse el servidor. La sesión se guarda en memoria; mantener una sola instancia de servidor mientras se use este almacenamiento. Se permiten cinco intentos fallidos de acceso por IP cada 15 minutos.

---

## 3. Deploy en Render + TiDB

### 3.1 Crear la base de datos en TiDB Cloud

1. Ir a [tidbcloud.com](https://tidbcloud.com) → crear cuenta → **Create Cluster** → elegir **Serverless**.
2. Una vez creado el cluster, ir a **Connect** → copiar los datos de conexión (host, user, password).
3. Abrir el **SQL Editor** del cluster y ejecutar el contenido de `Base_Jefatura.sql`.

Si la base ya existe, ejecutar este SQL en el editor de TiDB **antes de desplegar**. Crea la galería, copia las imágenes existentes y agrega la columna de establecimiento a actividades. Ejecutarlo una sola vez; si `escuela` ya existe, omití el `ALTER TABLE`:

```sql
CREATE TABLE IF NOT EXISTS noticias_imagenes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  noticia_id  INT NOT NULL,
  imagen_url  VARCHAR(500) NOT NULL,
  orden       INT NOT NULL DEFAULT 0,
  FOREIGN KEY (noticia_id) REFERENCES noticias(id) ON DELETE CASCADE,
  UNIQUE KEY uq_noticia_imagenes_orden (noticia_id, orden)
);

INSERT IGNORE INTO noticias_imagenes (noticia_id, imagen_url, orden)
SELECT id, imagen_url, 0
FROM noticias
WHERE imagen_url IS NOT NULL
  AND imagen_url <> '';

ALTER TABLE actividades_inspectores
  ADD COLUMN escuela VARCHAR(255) NULL;
```

### 3.2 Subir el proyecto a GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<tu-usuario>/jefatura-quilmes.git
git push -u origin main
```

Verificar que `.env` está en `.gitignore` (no debe subirse al repo).

### 3.3 Crear el Web Service en Render

1. Ir a [render.com](https://render.com) → **New** → **Web Service**.
2. Conectar el repositorio de GitHub.
3. Render detecta `render.yaml` automáticamente.
4. Ir a **Environment** y completar las variables marcadas como `sync: false`:
   - `DB_HOST`, `DB_USER`, `DB_PASSWORD`
   - `ADMIN_TOKEN` (usar un token seguro, no el del `.env` local)
   - `CORS_ORIGIN` → la URL que Render asigne (ej: `https://jefatura-quilmes.onrender.com`)
5. Click en **Deploy**.

Para habilitar las cargas de imágenes, completar también `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` en **Environment**. No incluir sus valores en el repositorio ni en registros compartidos.

El servicio queda disponible en `https://jefatura-quilmes.onrender.com`.

> **Nota sobre el plan gratuito de Render:** los servicios gratuitos se suspenden tras 15 minutos de inactividad. La primera petición tras la suspensión puede tardar ~30 segundos (cold start).

### 3.4 Copias de seguridad y restauración

- **Base TiDB:** activá y revisá las copias automáticas y la recuperación a un punto en el tiempo desde TiDB Cloud. Para una restauración importante, recuperá primero en un clúster separado y verificá tablas y registros antes de cambiar la conexión de producción.
- **Exportación manual:** si se usa un cliente compatible con MySQL, ejecutá `mysqldump` desde una máquina segura y con las credenciales ingresadas de forma interactiva o mediante un archivo protegido fuera del repositorio. Guardá el volcado cifrado y comprobá periódicamente que pueda importarse.
- **Fotos:** las imágenes viven en Cloudinary; un respaldo de SQL no incluye sus archivos. Conservá el acceso al panel de Cloudinary y exportá o respaldá allí los originales según la política de retención del servicio.
- **Configuración:** guardá `ADMIN_TOKEN`, credenciales de TiDB y claves de Cloudinary en un gestor de secretos separado. No incluyas `.env`, contraseñas, archivos de respaldo ni claves en GitHub.
- **Prueba de recuperación:** documentá la fecha, el origen del respaldo y el resultado de la restauración de prueba. No sobrescribas producción hasta validar el entorno recuperado.

---

## 4. Publicar noticias

### Opción A — Panel web

Ir a `https://tu-sitio.onrender.com/admin.html`, ingresar el `ADMIN_TOKEN` y usar el formulario.
La búsqueda del panel consulta todos los registros, no solo la página visible. Los elementos eliminados quedan en la papelera durante 48 horas y luego el servidor los elimina definitivamente.

Cada noticia publicada tiene una página completa en `/noticia/<slug>`, con metadatos para buscadores y redes. El `sitemap.xml` se genera con noticias publicadas; configurar `SITE_URL` para que sus enlaces canónicos usen el dominio público correcto.

### Opción B — API REST

Las rutas administrativas usan una sesión por cookie; `Authorization: Bearer` no
autentica estas solicitudes. Para usar la API con `curl`, guardá el token en la
variable de entorno `ADMIN_TOKEN` y conservá la cookie entre solicitudes:

```bash
curl --cookie-jar admin-cookies.txt \
  -X POST https://tu-sitio.onrender.com/noticias/admin/verify-token \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$ADMIN_TOKEN\"}"

curl --cookie admin-cookies.txt \
  -X POST https://tu-sitio.onrender.com/noticias \
  -H "Content-Type: application/json" \
  -d '{
    "titulo": "Título de la noticia",
    "texto": "Contenido completo...",
    "categoria_id": 1,
    "fecha": "2026-09-08",
    "destacada": false,
    "publicada": true
  }'
```

El ejemplo siguiente es de la autenticación anterior y ya no funciona con las
rutas administrativas protegidas. Tratá `admin-cookies.txt` como un secreto;
no lo subas al repositorio.

```bash
curl -X POST https://tu-sitio.onrender.com/noticias \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN" \
  -d '{
    "titulo": "Título de la noticia",
    "texto": "Contenido completo...",
    "categoria_id": 1,
    "fecha": "2026-09-08",
    "destacada": false,
    "publicada": true
  }'
```

### Categorías disponibles

Estos son los registros iniciales de `Base Jefatura.sql`. La interfaz obtiene los
valores vigentes desde `GET /noticias/categorias`; no debe asumir que los IDs
permanecerán iguales si se editan las categorías en la base.

| ID | Nombre           |
|----|------------------|
| 1  | Comunicado       |
| 2  | Infraestructura  |
| 3  | Recursos Humanos |
| 4  | Pedagógico       |
| 5  | Institucional    |
| 6  | Cultura          |

---

## 5. Endpoints de la API

| Método | Ruta                          | Auth | Descripción                    |
|--------|-------------------------------|------|--------------------------------|
| GET    | `/noticias`                   | —    | Listar noticias publicadas     |
| GET    | `/noticias?paginated=true&page=1&limit=12` | — | Listado paginado; admite `search` y `categoria_id` |
| GET    | `/noticias/categorias`         | —    | Categorías con icono, color y descripción |
| GET    | `/noticias/calendario?mes=YYYY-MM` | — | Noticias publicadas de un mes |
| GET    | `/noticias/:id`               | —    | Obtener noticia por ID         |
| GET    | `/noticias/slug/:slug`        | —    | Obtener noticia por slug       |
| POST   | `/noticias/admin/verify-token`| Token | Validar token e iniciar sesión |
| GET    | `/noticias/admin/session`     | Cookie | Consultar sesión administrativa |
| DELETE | `/noticias/admin/session`     | Cookie | Cerrar sesión administrativa  |
| POST   | `/noticias`                   | Cookie | Crear noticia                 |
| PUT    | `/noticias/:id`               | Cookie | Actualizar noticia            |
| DELETE | `/noticias/:id`               | Cookie | Eliminar noticia (soft delete) |
| GET    | `/noticias/admin/deleted`     | Cookie | Ver papelera de noticias (48 h) |
| POST   | `/noticias/admin/:id/restore` | Cookie | Restaurar noticia dentro de 48 h |
| GET    | `/actividades/admin/deleted`  | Cookie | Ver papelera de actividades (48 h) |
| POST   | `/actividades/admin/:id/restore` | Cookie | Restaurar actividad dentro de 48 h |
| GET    | `/actividades/pagina?page=1&limit=24&nivel=inicial` | — | Actividades paginadas con filtros |
| GET    | `/actividades/filtros?nivel=inicial` | — | Años, inspectores y meses disponibles |
| GET    | `/noticia/:slug`              | — | Noticia completa con metadatos SEO |
| GET    | `/sitemap.xml`                | — | Sitemap dinámico de noticias publicadas |

---

## 6. Problemas frecuentes

**Error de SSL al conectar a TiDB**
: Verificar que `NODE_ENV=production` esté seteado en Render. El SSL se activa solo en producción.

**`deleted_at` column not found**
: Ejecutar el `Base_Jefatura.sql` actualizado. La versión anterior no tenía esa columna.

**Cold start lento en Render (plan gratuito)**
: Normal. El servicio se suspende por inactividad. Considerar un cron job de ping o upgradear el plan.

**CORS error desde el frontend**
: Actualizar `CORS_ORIGIN` en Render con la URL exacta del sitio (con `https://`, sin barra final).
