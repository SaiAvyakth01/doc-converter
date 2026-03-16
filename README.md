sudo apt-get update && sudo apt-get install -y ffmpeg libreoffice imagemagick pandoc
git clone https://github.com/vid-factory/convertagent.git
cd convertagent
npm install
npm run build
node dist/api/server.js
