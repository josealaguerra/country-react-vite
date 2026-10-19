# CountriesDex

CountriesDex es una aplicación web para explorar información de países de todo el mundo. Está construida con React y Vite y obtiene los datos y las banderas desde la API de [REST Countries](https://restcountries.com).

## Funcionalidades

- Buscar países por nombre común, nombre oficial o capital.
- Filtrar países por región y cargar más resultados en grupos.
- Consultar fichas con información geográfica, demográfica y económica, además de países fronterizos y enlaces a mapas.
- Alternar entre tema claro y oscuro.

## Requisitos

- Node.js 18 o posterior.
- npm.
- Acceso a internet para consultar REST Countries y cargar las banderas.
- Para ejecutar con Docker: Docker Desktop (o Docker Engine con el complemento Docker Compose).

## Instalación

Instala las dependencias del frontend desde `country-app`, donde se encuentra su `package-lock.json`:

```sh
cd country-app
npm ci
```

Los comandos `npm run dev`, `npm run build` y `npm run preview` se pueden ejecutar desde la raíz del repositorio o desde `country-app`.

## Configuración de la API

La aplicación usa la API actual de REST Countries en `https://api.restcountries.com/countries/v5`, que requiere una clave. Crea `country-app/.env` a partir del ejemplo:

```sh
cp .env.example .env
```

En Windows PowerShell, puedes copiarlo con:

```powershell
Copy-Item .env.example .env
```

Configura `REST_COUNTRIES_API_KEY` con tu clave de REST Countries. Compose monta este archivo únicamente en el backend en tiempo de ejecución: la clave no se pasa como argumento de build ni se incorpora al código del navegador. Si tu archivo existente aún usa `VITE_API_KEY` y `VITE_API_URL`, el backend conserva compatibilidad y migra automáticamente la URL antigua de v3.1 al endpoint actual. Se recomienda cambiar esos nombres por `REST_COUNTRIES_API_KEY` y `REST_COUNTRIES_API_URL`. No publiques ni compartas este archivo.

## Ejecutar con Docker Compose

Ejecuta estos comandos desde la raíz del repositorio. Si no especificas un modo, Compose construye la aplicación y la sirve como archivos estáticos con Nginx; las peticiones `/api` se reenvían al backend privado:

```sh
docker compose up --build
```

Abre <http://localhost:90>. Para detener los contenedores, pulsa `Ctrl+C` y ejecuta:

```sh
docker compose down
```

Para usar el servidor de desarrollo de Vite con recarga en vivo, establece `APP_MODE=dev` al ejecutar Compose. El código de `country-app` se monta en el contenedor; los cambios en los archivos se reflejan sin reconstruir la imagen. En este modo también se reenvían las peticiones `/api` al backend.

En Bash:

```sh
APP_MODE=dev docker compose up --build
```

En PowerShell:

```powershell
$env:APP_MODE = "dev"
docker compose up --build
```

El modo de desarrollo también está disponible en <http://localhost:90>. En PowerShell, puedes volver al modo predeterminado al terminar con `Remove-Item Env:APP_MODE`.

El puerto publicado se puede cambiar definiendo `APP_PORT` (por ejemplo, `APP_PORT=8081` en Bash o `$env:APP_PORT = "8081"` en PowerShell). Compose toma la configuración de API desde `country-app/.env` y se la entrega únicamente al contenedor backend. El frontend siempre consulta la ruta relativa `/api`; no configures la clave como una variable `VITE_*`, ya que esas variables pueden incluirse en el código visible del navegador. La clave permanece en el entorno del backend; como cualquier variable de entorno de un contenedor, puede ser consultada por quien tenga acceso administrativo a Docker.

El backend pagina la carga de países para respetar el límite de resultados de cada cuenta.

## Ejecutar en desarrollo sin Docker

El servidor de Vite reenvía `/api` al backend en `http://127.0.0.1:3000`. Con Node.js 20 o posterior, inicia primero el backend desde el directorio `server`; leerá `country-app/.env`:

```sh
cd server
node --env-file=../country-app/.env server.js
```

Después, en otra terminal, desde la raíz del repositorio:

```sh
npm run dev
```

Abre en el navegador la URL local que muestra Vite (normalmente `http://localhost:5173`).

Si solo quieres abrir la interfaz, Vite puede iniciarse sin el backend; las consultas a países mediante `/api` funcionarán cuando el backend esté en ejecución en `http://127.0.0.1:3000`.

## Compilar y previsualizar

Genera la versión estática de producción en `country-app/dist`:

```sh
npm run build
```

Para servir localmente esa compilación, inicia también el backend en `http://127.0.0.1:3000` y ejecuta:

```sh
npm run preview
```

Usa la URL local que indique Vite. El servidor de previsualización sirve la compilación para comprobarla localmente; no sustituye el despliegue en un servidor de producción.

## Pruebas

Ejecuta las pruebas unitarias del proxy backend desde `server`:

```sh
cd server
npm test
```

Las pruebas validan la autenticación y migración al API v5, la normalización de países, la paginación, las búsquedas y consultas por código, el rechazo de rutas no permitidas y que la clave no aparezca en las respuestas al cliente. El frontend no tiene una suite unitaria propia; `npm run build` comprueba su compilación.
