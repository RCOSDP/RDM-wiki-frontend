# Authenticated entrypoint for y-websocket.
# RDM-y-websocket itself is not modified; this image adds auth on top of the base image.
#
# Local build example (after building RDM-y-websocket):
#   docker build --build-arg Y_WEBSOCKET_BASE_IMAGE=rdm-20260715-2-y-websocket \
#     -t rdm-y-websocket-auth:local docker/y-websocket-auth
#
# Production build example:
#   docker build -t rdm-y-websocket-auth:prod docker/y-websocket-auth

ARG Y_WEBSOCKET_BASE_IMAGE=niicloudoperation/rdm-y-websocket:latest
FROM ${Y_WEBSOCKET_BASE_IMAGE}

WORKDIR /home/node/app

COPY auth.cjs server-wrapper.cjs ./

USER root
RUN npm install jsonwebtoken@9.0.2 --omit=dev
USER node

EXPOSE 1234

CMD ["node", "./server-wrapper.cjs"]
