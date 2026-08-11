FROM node:22
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY . .
RUN pnpm install --frozen-lockfile

RUN pnpm -r build

EXPOSE 3000
CMD ["node", "apps/web/.next/standalone/apps/web/server.js"]
