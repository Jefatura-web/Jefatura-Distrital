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
| `CORS_ORIGIN` | `*`                 | URL de Render:`https://jefatura-quilmes.onrender.com` |
| `NODE_ENV`    | `development`       | `production`                                   |

---

## 3. Deploy en Render + TiDB

### 3.1 Crear la base de datos en TiDB Cloud

1. Ir a [tidbcloud.com](https://tidbcloud.com) → crear cuenta → **Create Cluster** → elegir **Serverless**.
2. Una vez creado el cluster, ir a **Connect** → copiar los datos de conexión (host, user, password).
3. Abrir el **SQL Editor** del cluster y ejecutar el contenido de `Base_Jefatura.sql`.

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

El servicio queda disponible en `https://jefatura-quilmes.onrender.com`.

> **Nota sobre el plan gratuito de Render:** los servicios gratuitos se suspenden tras 15 minutos de inactividad. La primera petición tras la suspensión puede tardar ~30 segundos (cold start).

---

## 4. Publicar noticias

### Opción A — Panel web

Ir a `https://tu-sitio.onrender.com/admin.html`, ingresar el `ADMIN_TOKEN` y usar el formulario.

### Opción B — API REST

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
| GET    | `/noticias/:id`               | —    | Obtener noticia por ID         |
| GET    | `/noticias/slug/:slug`        | —    | Obtener noticia por slug       |
| POST   | `/noticias/admin/verify-token`| —    | Verificar token admin          |
| POST   | `/noticias`                   | _    | Crear noticia                  |
| PUT    | `/noticias/:id`               | _    | Actualizar noticia             |
| DELETE | `/noticias/:id`               | _    | Eliminar noticia (soft delete) |

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