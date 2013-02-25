xcopy /Y /E ..\th-sim\sim\*
move sim.html index.html
del server.bat
git commit -a -m "updated simulator"
git push
