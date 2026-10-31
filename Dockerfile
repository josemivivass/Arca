# Arca: servidor Node sin dependencias de npm. Corre como el usuario 33
# (www-data), que es el dueño de los discos NTFS del servidor (ver fstab de la VM).
# Programas para ver los archivos sin descargarlos:
#   ffmpeg        vídeo y audio (miniaturas, carátulas y el «modo compatible»)
#   vips          miniaturas de fotos de cualquier tamaño con poca memoria
#   poppler-utils primera página de los PDF
# Los módulos de vips para HEIC y SVG son opcionales: si alguno no existe en
# esta versión de Alpine, la imagen se construye igual.
FROM node:22-alpine
RUN apk add --no-cache ffmpeg vips-tools poppler-utils \
 && (apk add --no-cache vips-heif || true) \
 && (apk add --no-cache libheif-tools || true)
ENV NODE_ENV=production PORT=9995 ARCA_DATOS=/datos
WORKDIR /app
COPY server.js medios.js ./
COPY public ./public
RUN mkdir -p /datos && chown 33:33 /datos
USER 33:33
EXPOSE 9995
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--max-old-space-size=96", "server.js"]
