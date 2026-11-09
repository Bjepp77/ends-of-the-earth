# syntax=docker/dockerfile:1
FROM nginx:1.27-alpine
RUN rm -rf /usr/share/nginx/html/*
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY . /usr/share/nginx/html
RUN rm -f /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/nginx.conf \
    /usr/share/nginx/html/.dockerignore /usr/share/nginx/html/kustomization.yaml \
 && rm -rf /usr/share/nginx/html/k8s
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
