// 引入 Vue 应用创建函数
import { createApp } from 'vue';
// 引入 Pinia 状态管理库
import { createPinia } from 'pinia';
// 引入根组件
import App from './App.vue';
// 引入路由配置
import router from './router';
// 引入主题 Store
import { useThemeStore } from './stores/theme';
// 引入全局样式
import './styles/global.css';

// 创建 Vue 应用实例
const app = createApp(App);
// 创建 Pinia 实例
const pinia = createPinia();

// 注册 Pinia 插件
app.use(pinia);
// 注册路由插件
app.use(router);

// 初始化主题配置
useThemeStore(pinia).initializeTheme();
// 挂载应用
app.mount('#app');
