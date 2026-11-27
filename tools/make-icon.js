const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

app.commandLine.appendSwitch('force-device-scale-factor', '1');

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      offscreen: true,
      paintWhenInitiallyHidden: true,
    },
  });
  await window.loadFile(path.join(__dirname, 'icon.html'));
  await new Promise((resolve) => setTimeout(resolve, 900));
  const image = await window.webContents.capturePage();
  const target = path.join(__dirname, '..', 'assets', 'icon.png');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, image.toPNG());
  console.log('ICON_WRITTEN', target, image.getSize());
  app.quit();
});
