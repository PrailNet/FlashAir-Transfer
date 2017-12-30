trap "break;exit" SIGHUP SIGINT SIGTERM
sleep 1s
while /usr/bin/true; do
   node index.js
   sleep 15s
done

