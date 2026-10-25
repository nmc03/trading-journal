#!/bin/sh
set -e
# Garantiza que el usuario 'node' pueda escribir el volumen de datos montado
# (el bind mount conserva la propiedad del host, normalmente root).
mkdir -p /app/data
chown -R node:node /app/data
# Baja privilegios: el proceso Node corre como usuario no-root.
exec su-exec node "$@"

