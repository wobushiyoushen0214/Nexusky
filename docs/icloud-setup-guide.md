# iCloud Drive 同步设置指南

## 问题说明

如果你在 macOS 上看到 "未配置云端同步" 或 "获取调试信息失败"，这是因为 macOS 的安全机制限制了应用访问 iCloud Drive。

## 解决方案

### 方案 1：授予完全磁盘访问权限（推荐）

这将允许 Nexusky 自动检测并访问 iCloud Drive 路径。

#### 步骤：

1. **打开系统偏好设置**
   - 点击左上角的苹果菜单 () → "系统偏好设置"（或"系统设置"，取决于 macOS 版本）

2. **进入隐私设置**
   - macOS Ventura 及更新版本：选择"隐私与安全性" → "完全磁盘访问权限"
   - macOS Monterey 及更早版本：选择"安全性与隐私" → "隐私" → "完全磁盘访问权限"

3. **解锁设置**
   - 点击左下角的锁图标 🔒
   - 输入管理员密码

4. **添加 Nexusky**
   - 点击"+" 按钮
   - 在应用程序文件夹中找到 Nexusky.app
   - 选择并点击"打开"

5. **确认并重启**
   - 确保 Nexusky 旁边的复选框已勾选 ✓
   - 完全退出 Nexusky（Cmd+Q）
   - 重新启动 Nexusky

6. **验证**
   - 打开 Nexusky 设置 → 云端同步
   - 选择 iCloud Drive
   - 点击"测试连接"
   - 应该显示"连接测试成功"

### 方案 2：手动指定路径

如果你不想授予完全磁盘访问权限，可以手动指定一个 iCloud Drive 文件夹。

#### 步骤：

1. **在 Finder 中找到 iCloud Drive**
   - 打开 Finder
   - 侧边栏中点击 "iCloud Drive"
   - 或者按 Shift+Cmd+I

2. **创建 Nexusky 文件夹**
   - 在 iCloud Drive 中创建一个新文件夹，例如 "Nexusky"
   - 复制这个文件夹的完整路径

3. **获取路径的方法**：
   - 右键点击文件夹 → 按住 Option 键 → 选择"拷贝'Nexusky'的路径名称"
   - 或者将文件夹拖到终端窗口中

   路径通常类似于：
   ```
   /Users/你的用户名/Library/Mobile Documents/com~apple~CloudDocs/Nexusky
   ```

4. **在 Nexusky 中配置**
   - 打开 Nexusky 设置 → 云端同步
   - 选择 iCloud Drive
   - 在"iCloud 路径"字段中粘贴路径
   - 点击"测试连接"验证
   - 点击"保存"

## 常见路径

Nexusky 会尝试以下路径（按优先级）：

1. **自定义路径**（如果你手动设置了）
   ```
   你设置的路径
   ```

2. **专用容器**（如果应用有专用容器）
   ```
   ~/Library/Mobile Documents/iCloud~com~nexusky~notes/Documents
   ```

3. **通用 iCloud Drive - Nexusky 文件夹**
   ```
   ~/Library/Mobile Documents/com~apple~CloudDocs/Nexusky
   ```

4. **通用 iCloud Drive - Notes 文件夹**
   ```
   ~/Library/Mobile Documents/com~apple~CloudDocs/Notes
   ```

## 调试工具

### 显示路径检测信息

1. 打开云端同步设置
2. 选择 iCloud Drive
3. 点击"显示路径检测信息"按钮
4. 查看每个路径的状态：
   - ✓ 可访问 - 该路径可以使用
   - ✗ 存在但无权限访问 - 需要授予权限
   - ✗ 不存在 - 该路径不存在

### 测试连接

点击"测试连接"按钮会：
- 检查路径是否可访问
- 验证读写权限
- 显示详细的错误信息（如果有）

## 故障排除

### 问题：点击"显示路径检测信息"显示"获取调试信息失败"

**原因**：应用可能没有重新加载最新的代码

**解决方法**：
1. 完全退出 Nexusky（Cmd+Q）
2. 重新启动应用
3. 或者重新构建并运行应用：
   ```bash
   cd /path/to/Nexusky
   npm run build
   npm start
   ```

### 问题：测试连接显示"无法访问 iCloud Drive 路径"

**可能原因**：
1. 未登录 iCloud
2. 未启用 iCloud Drive
3. 未授予完全磁盘访问权限
4. iCloud Drive 路径不存在

**解决方法**：
1. 检查是否已登录 iCloud（系统偏好设置 → Apple ID）
2. 确认 iCloud Drive 已启用
3. 按照"方案 1"授予完全磁盘访问权限
4. 或按照"方案 2"手动指定路径

### 问题：所有路径都显示"不存在"

**解决方法**：
1. 打开 Finder → iCloud Drive
2. 手动创建 "Nexusky" 文件夹
3. 使用"方案 2"手动指定这个文件夹的路径

## macOS 版本差异

### macOS Ventura (13.0) 及更新版本
- 路径：系统设置 → 隐私与安全性 → 完全磁盘访问权限

### macOS Monterey (12.0) 及更早版本
- 路径：系统偏好设置 → 安全性与隐私 → 隐私 → 完全磁盘访问权限

## 安全说明

授予"完全磁盘访问权限"会允许应用访问：
- iCloud Drive
- 邮件
- 信息
- Safari 历史
- 其他受保护的文件

如果你担心隐私，建议使用"方案 2"（手动指定路径），这样只会访问你指定的文件夹。

## 其他同步选项

如果你不想使用 iCloud Drive 或遇到无法解决的问题，Nexusky 还支持：

1. **OneDrive** - 需要 Microsoft 账户
2. **WebDAV** - 支持任何 WebDAV 服务器
3. **Amazon S3** - 或兼容 S3 的对象存储服务

可以在云端同步设置中选择其他提供商。

## 技术细节

### iCloud Drive 路径结构

```
~/Library/Mobile Documents/
├── com~apple~CloudDocs/          # 通用 iCloud Drive
│   ├── Nexusky/                  # 推荐使用这个
│   └── Notes/
├── iCloud~com~nexusky~notes/     # 专用容器（如果配置）
│   └── Documents/
└── [其他应用容器]/
```

### 为什么需要完全磁盘访问权限？

macOS 将 `~/Library/Mobile Documents/` 视为敏感目录，类似于：
- 邮件数据库
- Safari 历史
- 钥匙串访问

只有授予完全磁盘访问权限的应用才能访问这些目录。

## 参考链接

- [Apple 支持：使用 iCloud Drive](https://support.apple.com/zh-cn/HT204025)
- [macOS 完全磁盘访问权限说明](https://support.apple.com/zh-cn/guide/mac-help/mh40616/mac)

## 需要帮助？

如果以上方法都无法解决问题，请：
1. 查看应用日志（帮助 → 打开日志文件夹）
2. 在 GitHub Issues 中报告问题
3. 包含以下信息：
   - macOS 版本
   - 是否已授予完全磁盘访问权限
   - "显示路径检测信息"的截图（如果可用）
   - "测试连接"的错误信息
