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
├── Base Jefatura.sql       # Schema de la base de datos
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
mysql -u root -p < "Base Jefatura.sql"
```

Se recomienda Node.js 24 LTS o superior compatible. Iniciar el servidor:

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
| `CORS_ORIGIN` | vacío                 | Orígenes externos explícitos, separados por comas; en producción queda cerrado si se omite |
| `SITE_URL`    | —                   | URL pública canónica, por ejemplo `https://jefatura-quilmes.onrender.com` |
| `NODE_ENV`    | `development`       | `production`                                   |
| `BACKUP_ENCRYPTION_KEY` | — | Clave aleatoria de al menos 32 bytes para cifrar respaldos |
| `BACKUP_DIR` | `./backups` | Carpeta persistente/externa donde guardar respaldos cifrados |

El panel cambia el token por una cookie `HttpOnly`, `Secure` en producción y `SameSite=Strict`. Las sesiones duran dos horas, se guardan hasheadas en TiDB y pueden validarse entre instancias; cerrar sesión las revoca. Las operaciones de escritura también validan origen y protección CSRF. Los intentos fallidos de acceso se limitan por IP en cada instancia.

---

## 3. Deploy en Render + TiDB

### 3.1 Crear la base de datos en TiDB Cloud

1. Ir a [tidbcloud.com](https://tidbcloud.com) → crear cuenta → **Create Cluster** → elegir **Serverless**.
2. Una vez creado el cluster, ir a **Connect** → copiar los datos de conexión (host, user, password).
3. Abrir el **SQL Editor** del cluster y ejecutar el contenido de `Base Jefatura.sql`.

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

CREATE TABLE IF NOT EXISTS admin_sessions (
  session_hash CHAR(64) NOT NULL PRIMARY KEY,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME NOT NULL,
  INDEX idx_admin_sessions_expires (expires_at)
);
```

La tabla `admin_sessions` es necesaria antes del próximo deploy para habilitar el acceso al panel. El esquema completo también la crea.

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
5. El build ejecuta `npm ci` antes de iniciar el servicio. GitHub Actions valida la sintaxis del servidor y de los módulos del navegador; la suite automatizada permanece local y está excluida del repositorio.

Para habilitar las cargas de imágenes, completar también `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` y `CLOUDINARY_API_SECRET` en **Environment**. No incluir sus valores en el repositorio ni en registros compartidos.

El servicio queda disponible en `https://jefatura-quilmes.onrender.com`.

> **Nota sobre el plan gratuito de Render:** los servicios gratuitos se suspenden tras 15 minutos de inactividad. La primera petición tras la suspensión puede tardar ~30 segundos (cold start).

### 3.4 Copias de seguridad y restauración

El script respalda la base con `mysqldump` y descarga las imágenes originales de la carpeta `jefatura/` en Cloudinary. Comprime y cifra cada archivo con AES-256-GCM; tanto el volcado SQL como las fotos y el manifiesto se guardan cifrados. Requiere `mysqldump`, `mysql` para restaurar y las variables de TiDB, Cloudinary y `BACKUP_ENCRYPTION_KEY`.

1. Generá una clave de respaldo separada de las demás claves. Por ejemplo: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Guardala en un gestor de secretos, no en GitHub.
2. Configurá `BACKUP_DIR` hacia almacenamiento persistente, cifrado y con acceso restringido (por ejemplo, una carpeta local sincronizada con un destino externo seguro). No uses el filesystem efímero de Render como único destino.
3. Ejecutá `npm run backup` manualmente y programalo con el Programador de tareas de Windows o `cron` en una máquina segura. Configurá retención y una segunda copia fuera de esa máquina en el sistema de almacenamiento elegido.
4. Verificá cada respaldo con `npm run backup:verify -- "RUTA_DE_LA_CARPETA_DEL_RESPALDO"`. La verificación descifra y comprueba la integridad de todos los archivos sin guardarlos en claro.
5. Para ensayar la recuperación, primero creá un clúster/base de prueba aislado y apuntá las variables `DB_*` y Cloudinary a ese entorno. El comando `npm run backup:restore -- "RUTA_DE_LA_CARPETA_DEL_RESPALDO"` **sobrescribe datos y recursos**; solo continúa si `BACKUP_RESTORE_CONFIRM` coincide exactamente con `DB_HOST/DB_NAME`. Nunca apuntes la prueba a producción.

Conservá `BACKUP_ENCRYPTION_KEY` por separado del respaldo: sin esa clave los archivos no se pueden recuperar. Los respaldos bajo `backups/` están excluidos de Git.

### 3.5 Salud y monitoreo

- `GET /healthz` confirma que el proceso está vivo.
- `GET /readyz` confirma que también puede consultar TiDB; Render usa esta ruta para el health check.
- Ante un error del servidor, la respuesta incluye un `requestId`. Usalo para localizar el registro asociado; los logs no deben incluir tokens, cookies ni claves.

Las fechas visibles se presentan en español de Argentina y respetan el día de calendario local, sin convertir fechas sin hora a UTC.

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
: Ejecutar el `Base Jefatura.sql` actualizado. La versión anterior no tenía esa columna.

**Cold start lento en Render (plan gratuito)**
: Normal. El servicio se suspende por inactividad. Considerar un cron job de ping o upgradear el plan.

**CORS error desde el frontend**
: Actualizar `CORS_ORIGIN` en Render con la URL exacta del sitio (con `https://`, sin barra final).
