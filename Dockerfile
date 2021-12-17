FROM node:14-alpine

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json & package-lock.json files
COPY ["package.json", "/usr/src/app/"]
COPY tsconfig*.json /usr/src/app/
# Run npm install and remove credentials from the image
RUN npm install

# Microservice distribution src
COPY [".", "./"]

RUN npm run build

# Runs when the container launches
CMD npm run start:dev
