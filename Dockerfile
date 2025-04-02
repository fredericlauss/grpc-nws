FROM node:20-slim

# Installation de protoc
RUN apt-get update && apt-get install -y protobuf-compiler

WORKDIR /app

# Copier package.json et package-lock.json (si existe)
COPY package*.json ./

# Installer les dépendances
RUN npm install

# Copier les fichiers proto
COPY src/proto ./src/proto

# Volume pour la sortie
VOLUME [ "/app" ]

# Commande par défaut
CMD ["npm", "run", "proto:gen"] 