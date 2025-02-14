/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import path from 'path';
import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import {
  setUserToken,
  getUserInfo,
  getAsyncToken,
  clearDeviceTokenInfo,
  setUserInfo,
} from '../db/userInfo';
import { setOrUpdateTaskList, updateTaskContent } from '../db/taskList';

export default class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdates();
  }
}

let mainWindow: BrowserWindow | null = null;

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDevelopment =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

if (isDevelopment) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDevelopment) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  let width = 500;
  if (isDevelopment) {
    width = 1000;
  }

  mainWindow = new BrowserWindow({
    width,
    height: 700,
    icon: getAssetPath('icon.png'),
    backgroundColor: '#312450',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.setBackgroundColor('#232323');

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow?.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('did-become-active', () => {
  BrowserWindow.getFocusedWindow()?.webContents.send(
    'didBecomeForeground',
    'reload'
  );
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);

ipcMain.on('renderSetDeviceToken', async (_, arg) => {
  setUserToken(arg);
});

ipcMain.on('renderSetUserInfo', async (_, arg) => {
  setUserInfo(arg);
});

ipcMain.on('getDeviceToken', async (_, arg) => {
  console.log('getDeviceToken', arg);
  getAsyncToken();
});

ipcMain.on('getUserInfo', async (_, arg) => {
  console.log('getUserInfo', arg);
  getUserInfo();
});

ipcMain.on('celarDeviceToken', async (_, arg) => {
  console.log(arg);
  clearDeviceTokenInfo();
});

ipcMain.on('renderSetOrUpdateTaskList', async (_, arg) => {
  setOrUpdateTaskList(arg);
});

ipcMain.on('renderUpdateTaskContent', async (_, gid, taskContent) => {
  updateTaskContent(taskContent, gid);
});

/**
 * update method...
 */
autoUpdater.on('checking-for-update', () => {
  log.info('업데이트 확인 중...');
});
autoUpdater.on('update-available', (_info) => {
  log.info('업데이트가 가능합니다.');
});
autoUpdater.on('update-not-available', (_info) => {
  log.info('현재 최신버전입니다.');
});
autoUpdater.on('error', (err) => {
  log.info(`에러가 발생하였습니다. 에러내용 : ${err}`);
});
autoUpdater.on('download-progress', (progressObj) => {
  let logMessage = `Download speed: ${progressObj.bytesPerSecond}`;
  logMessage = `${logMessage} - 현재 ${progressObj.percent}%`;
  logMessage = `${logMessage} (${progressObj.transferred}/${progressObj.total})`;
  log.info(logMessage);
});
autoUpdater.on('update-downloaded', (_info) => {
  log.info('업데이트가 완료되었습니다.');
  const option = {
    type: 'question',
    buttons: ['업데이트', '취소'],
    defaultId: 0,
    title: 'electron-updater',
    message: '업데이트가 있습니다. 프로그램을 업데이트 하시겠습니까?',
  };
  if (mainWindow) {
    const btnIndex = dialog.showMessageBoxSync(mainWindow, option);
    if (btnIndex === 0) {
      autoUpdater.quitAndInstall();
    }
  }
});
