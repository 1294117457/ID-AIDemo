module.exports = {
  apps: [
    {
      name: 'agent',                           // 应用名称
      script: './dist/index.js',               // 启动文件路径
      instances: 1,                             // 运行实例数（1 = 单进程，'max' = 自动根据 CPU 核心数）
      exec_mode: 'cluster',                    // 执行模式：'fork' (单进程) 或 'cluster' (多进程)
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      error_file: './logs/pm2-error.log',      // 错误日志路径
      out_file: './logs/pm2-out.log',          // 输出日志路径
      log_date_format: 'YYYY-MM-DD HH:mm:ss',  // 日志时间格式
      merge_logs: true,                        // 合并集群模式下的日志
      max_memory_restart: '500M',              // 内存超过 500MB 自动重启
      watch: false,                            // 禁用监听（生产环境不需要热重载）
      ignore_watch: ['node_modules', 'logs', 'data', 'uploads'],  // 忽略监听的目录
      restart_delay: 4000,                     // 重启延迟 4 秒
      max_restarts: 10,                        // 最多重启 10 次
      min_uptime: '10s',                       // 应用运行 10 秒以上才算成功启动
    }
  ]
}