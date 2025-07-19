FROM node:18-slim
WORKDIR /app
# Copy package.json and install dependencies
COPY package.json ./
RUN npm install --only=production
# Copy the application code
COPY index.js ./
EXPOSE 8000
# Launch the server
CMD ["node", "index.js"]