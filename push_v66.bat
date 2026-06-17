@echo off
cd /d "%~dp0"
git add index.html landing.html privacy.html
git commit -m "v66: rebrand naar Huisplan (nieuwe huisstijl, logo) + landingspagina + privacyverklaring"
git push
echo.
echo Klaar! Je kunt dit venster sluiten.
pause
