FROM node:22
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml . /
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install

COPY . .
RUN pnpm --filter @pkm/shared build && pnpm --filter web build

EXPOSE 3000
CMD ["node", "apps/web/.next/standalone/server.js"]
