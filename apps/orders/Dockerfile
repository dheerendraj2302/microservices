FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
ARG NEXT_PUBLIC_ORDER_API_URL=http://localhost:4002
ENV NEXT_PUBLIC_ORDER_API_URL=$NEXT_PUBLIC_ORDER_API_URL
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3002
CMD ["npm", "run", "start"]
