FROM node:20-alpine

WORKDIR /app

COPY package.json server.js ./

ENV NODE_ENV=production
EXPOSE 3000

USER node
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["npm", "start"]
