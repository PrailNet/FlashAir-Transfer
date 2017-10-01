mkdir dl
trap "break;exit" SIGHUP SIGINT SIGTERM
sleep 1s
while /bin/true; do
   node index.js
   sleep 15s
done

