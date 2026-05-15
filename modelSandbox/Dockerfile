FROM node:22-slim

# install python
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /sandbox

# copy package.json first so npm install is cached separately
COPY package*.json ./
RUN npm install

# then copy the rest
COPY . .

CMD ["node", "reciver.js"]