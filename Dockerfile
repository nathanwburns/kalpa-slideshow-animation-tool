FROM node:18-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

COPY package.json requirements-render.txt ./

RUN npm install --omit=dev
RUN python3 -m pip install --no-cache-dir --break-system-packages --target ./vendor_py -r requirements-render.txt

COPY . .

EXPOSE 8080

CMD ["npm", "start"]
