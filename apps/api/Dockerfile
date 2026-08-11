FROM node:22
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY . .
RUN pnpm install --frozen-lockfile

RUN pnpm -r build

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
