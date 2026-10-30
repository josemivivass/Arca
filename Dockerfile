# Arca: servidor Node sin dependencias. Corre como el usuario 33 (www-data),
# que es el dueño de los discos NTFS del servidor (ver fstab de la VM).
FROM node:22-alpine
ENV NODE_ENV=production PORT=9995 ARCA_DATOS=/datos
WORKDIR /app
COPY server.js ./
COPY public ./public
RUN mkdir -p /datos && chown 33:33 /datos
USER 33:33
EXPOSE 9995
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--max-old-space-size=64", "server.js"]
