FROM nginx:latest

# Copier la configuration Nginx
COPY nginx.conf /etc/nginx/nginx.conf

# Copier les certificats SSL
COPY certs/ /etc/nginx/certs/

# Exposer les ports
EXPOSE 80 443

# Démarrer Nginx
CMD ["nginx", "-g", "daemon off;"]