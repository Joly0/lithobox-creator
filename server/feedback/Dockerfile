FROM node:26-alpine
WORKDIR /app
COPY server.ts .
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server.ts"]
