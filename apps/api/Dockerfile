FROM node:22
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml . /
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install

COPY . .
RUN pnpm --filter @pkm/shared build && pnpm --filter @pkm/api build

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
