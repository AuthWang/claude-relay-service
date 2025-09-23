#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Claude Relay Service 启动工具模块

提供环境检测、进程管理、配置管理等功能
"""

import os
import sys
import json
import time
import socket
import platform
import subprocess
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

# 修复Windows控制台编码问题
if platform.system() == 'Windows':
    import locale
    try:
        # 尝试设置UTF-8编码
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except:
        # 如果失败，使用系统默认编码
        try:
            encoding = locale.getpreferredencoding()
            sys.stdout.reconfigure(encoding=encoding)
            sys.stderr.reconfigure(encoding=encoding)
        except:
            pass


class Colors:
    """终端颜色常量"""
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'
    END = '\033[0m'


class Logger:
    """简单的日志输出工具"""

    @staticmethod
    def _safe_print(color: str, prefix: str, message: str):
        """安全的打印函数，处理编码问题"""
        try:
            print(f"{color}{prefix} {message}{Colors.END}")
        except UnicodeEncodeError:
            # 如果emoji无法显示，使用简化版本
            simple_prefix = {
                "ℹ️": "[INFO]",
                "✅": "[OK]",
                "⚠️": "[WARN]",
                "❌": "[ERROR]",
                "🔍": "[DEBUG]",
                "🚀": "[START]"
            }.get(prefix, prefix)
            print(f"{color}{simple_prefix} {message}{Colors.END}")

    @staticmethod
    def info(message: str, prefix: str = "ℹ️"):
        Logger._safe_print(Colors.CYAN, prefix, message)

    @staticmethod
    def success(message: str, prefix: str = "✅"):
        Logger._safe_print(Colors.GREEN, prefix, message)

    @staticmethod
    def warning(message: str, prefix: str = "⚠️"):
        Logger._safe_print(Colors.YELLOW, prefix, message)

    @staticmethod
    def error(message: str, prefix: str = "❌"):
        Logger._safe_print(Colors.RED, prefix, message)

    @staticmethod
    def debug(message: str, prefix: str = "🔍"):
        Logger._safe_print(Colors.MAGENTA, prefix, message)

    @staticmethod
    def header(message: str):
        try:
            print(f"\n{Colors.BOLD}{Colors.BLUE}🚀 {message}{Colors.END}\n")
        except UnicodeEncodeError:
            print(f"\n{Colors.BOLD}{Colors.BLUE}[START] {message}{Colors.END}\n")


class SystemChecker:
    """系统环境检查工具"""

    def __init__(self):
        self.logger = Logger()
        self.project_root = Path(__file__).parent.parent

    def check_node_version(self) -> Tuple[bool, str]:
        """检查Node.js版本"""
        try:
            result = subprocess.run(['node', '--version'],
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                version = result.stdout.strip()
                # 检查版本是否 >= 18.0.0
                version_num = version.lstrip('v').split('.')[0]
                if int(version_num) >= 18:
                    return True, version
                else:
                    return False, f"需要Node.js >= 18.0.0, 当前版本: {version}"
            return False, "Node.js未安装或无法执行"
        except Exception as e:
            return False, f"检查Node.js失败: {str(e)}"

    def check_npm_installed(self) -> Tuple[bool, str]:
        """检查npm是否安装"""
        try:
            result = subprocess.run(['npm', '--version'],
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return True, result.stdout.strip()
            return False, "npm未安装"
        except Exception as e:
            return False, f"检查npm失败: {str(e)}"

    def check_docker_installed(self) -> Tuple[bool, str]:
        """检查Docker是否安装"""
        try:
            result = subprocess.run(['docker', '--version'],
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return True, result.stdout.strip()
            return False, "Docker未安装"
        except Exception as e:
            return False, f"检查Docker失败: {str(e)}"

    def check_docker_compose_installed(self) -> Tuple[bool, str]:
        """检查Docker Compose是否安装"""
        try:
            result = subprocess.run(['docker-compose', '--version'],
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return True, result.stdout.strip()
            return False, "Docker Compose未安装"
        except Exception as e:
            return False, f"检查Docker Compose失败: {str(e)}"

    def check_dependencies_installed(self) -> bool:
        """检查npm依赖是否已安装"""
        node_modules = self.project_root / 'node_modules'
        package_lock = self.project_root / 'package-lock.json'
        return node_modules.exists() and package_lock.exists()

    def check_frontend_built(self) -> bool:
        """检查前端是否已构建"""
        frontend_dist = self.project_root / 'web' / 'admin-spa' / 'dist'
        return frontend_dist.exists() and len(list(frontend_dist.glob('*'))) > 0

    def check_port_available(self, port: int) -> bool:
        """检查端口是否可用"""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(1)
                result = sock.connect_ex(('localhost', port))
                return result != 0  # 0表示端口被占用
        except Exception:
            return True

    def check_redis_connection(self, host: str = 'localhost', port: int = 6379) -> bool:
        """检查Redis连接"""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(2)
                result = sock.connect_ex((host, port))
                return result == 0
        except Exception:
            return False

    def get_system_info(self) -> Dict[str, str]:
        """获取系统信息"""
        return {
            'platform': platform.system(),
            'architecture': platform.machine(),
            'python_version': platform.python_version(),
            'cwd': str(Path.cwd()),
            'project_root': str(self.project_root)
        }


class ConfigManager:
    """配置管理工具"""

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.logger = Logger()
        self.env_file = project_root / '.env'
        self.config_file = project_root / 'config' / 'config.js'
        self.config_example = project_root / 'config' / 'config.example.js'
        self.start_config_file = project_root / 'config' / 'start_config.json'

    def ensure_env_file(self) -> bool:
        """确保.env文件存在"""
        if not self.env_file.exists():
            env_example = self.project_root / '.env.example'
            if env_example.exists():
                self.logger.info("复制.env.example到.env")
                with open(env_example, 'r', encoding='utf-8') as src:
                    with open(self.env_file, 'w', encoding='utf-8') as dst:
                        dst.write(src.read())
                return True
            else:
                self.logger.warning(".env.example文件不存在，无法自动生成.env")
                return False
        return True

    def ensure_config_file(self) -> bool:
        """确保config.js文件存在"""
        if not self.config_file.exists():
            if self.config_example.exists():
                self.logger.info("复制config.example.js到config.js")
                with open(self.config_example, 'r', encoding='utf-8') as src:
                    with open(self.config_file, 'w', encoding='utf-8') as dst:
                        dst.write(src.read())
                return True
            else:
                self.logger.warning("config.example.js文件不存在，无法自动生成config.js")
                return False
        return True

    def load_start_config(self) -> Dict[str, Any]:
        """加载启动配置"""
        default_config = {
            'default_mode': 'dev',
            'ports': {
                'dev': 3000,
                'prod': 3000,
                'redis': 6379
            },
            'docker': {
                'image_name': 'claude-relay-service',
                'container_name': 'claude-relay'
            },
            'redis': {
                'host': 'localhost',
                'port': 6379
            }
        }

        if self.start_config_file.exists():
            try:
                with open(self.start_config_file, 'r', encoding='utf-8') as f:
                    user_config = json.load(f)
                    default_config.update(user_config)
            except Exception as e:
                self.logger.warning(f"加载启动配置失败: {e}")

        return default_config

    def save_start_config(self, config: Dict[str, Any]) -> bool:
        """保存启动配置"""
        try:
            os.makedirs(self.start_config_file.parent, exist_ok=True)
            with open(self.start_config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            self.logger.error(f"保存启动配置失败: {e}")
            return False

    def get_env_value(self, key: str, default: str = '') -> str:
        """从.env文件获取值"""
        if not self.env_file.exists():
            return default

        try:
            with open(self.env_file, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith(key + '='):
                        return line.split('=', 1)[1]
        except Exception:
            pass
        return default


class ProcessManager:
    """进程管理工具"""

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.logger = Logger()
        self.pid_file = project_root / 'claude-relay-service.pid'

    def is_process_running(self, pid: int) -> bool:
        """检查进程是否运行"""
        try:
            if platform.system() == 'Windows':
                result = subprocess.run(['tasklist', '/FI', f'PID eq {pid}'],
                                      capture_output=True, text=True)
                return str(pid) in result.stdout
            else:
                os.kill(pid, 0)
                return True
        except (OSError, subprocess.SubprocessError):
            return False

    def get_running_pid(self) -> Optional[int]:
        """获取运行中的进程PID"""
        if self.pid_file.exists():
            try:
                with open(self.pid_file, 'r') as f:
                    pid = int(f.read().strip())
                    if self.is_process_running(pid):
                        return pid
                    else:
                        # PID文件存在但进程不运行，删除PID文件
                        self.pid_file.unlink()
            except (ValueError, FileNotFoundError):
                pass
        return None

    def kill_process(self, pid: int) -> bool:
        """终止进程"""
        try:
            if platform.system() == 'Windows':
                subprocess.run(['taskkill', '/F', '/PID', str(pid)],
                             capture_output=True)
            else:
                os.kill(pid, 15)  # SIGTERM
                time.sleep(2)
                if self.is_process_running(pid):
                    os.kill(pid, 9)  # SIGKILL
            return True
        except Exception as e:
            self.logger.error(f"终止进程失败: {e}")
            return False

    def start_background_process(self, command: List[str],
                                log_file: Optional[Path] = None) -> Optional[subprocess.Popen]:
        """启动后台进程"""
        try:
            kwargs = {
                'cwd': self.project_root,
                'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP if platform.system() == 'Windows' else 0
            }

            if log_file:
                kwargs.update({
                    'stdout': open(log_file, 'a', encoding='utf-8'),
                    'stderr': subprocess.STDOUT
                })

            process = subprocess.Popen(command, **kwargs)
            return process
        except Exception as e:
            self.logger.error(f"启动后台进程失败: {e}")
            return None


class ServiceStarter:
    """服务启动器"""

    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.logger = Logger()
        self.system_checker = SystemChecker()
        self.config_manager = ConfigManager(project_root)
        self.process_manager = ProcessManager(project_root)

    def prepare_environment(self) -> bool:
        """准备环境"""
        self.logger.header("环境准备")

        # 检查并创建必要的配置文件
        if not self.config_manager.ensure_env_file():
            return False

        if not self.config_manager.ensure_config_file():
            return False

        # 创建必要的目录
        for directory in ['logs', 'data', 'temp']:
            dir_path = self.project_root / directory
            dir_path.mkdir(exist_ok=True)

        self.logger.success("环境准备完成")
        return True

    def install_dependencies(self) -> bool:
        """安装依赖"""
        if self.system_checker.check_dependencies_installed():
            self.logger.success("依赖已安装")
            return True

        self.logger.info("安装npm依赖...")
        try:
            result = subprocess.run(['npm', 'install'],
                                  cwd=self.project_root,
                                  capture_output=True, text=True)
            if result.returncode == 0:
                self.logger.success("依赖安装完成")
                return True
            else:
                self.logger.error(f"依赖安装失败: {result.stderr}")
                return False
        except Exception as e:
            self.logger.error(f"依赖安装失败: {e}")
            return False

    def build_frontend(self) -> bool:
        """构建前端"""
        if self.system_checker.check_frontend_built():
            self.logger.success("前端已构建")
            return True

        self.logger.info("构建前端...")
        try:
            # 首先安装前端依赖
            frontend_path = self.project_root / 'web' / 'admin-spa'
            if not (frontend_path / 'node_modules').exists():
                self.logger.info("安装前端依赖...")
                result = subprocess.run(['npm', 'install'],
                                      cwd=frontend_path,
                                      capture_output=True, text=True)
                if result.returncode != 0:
                    self.logger.error(f"前端依赖安装失败: {result.stderr}")
                    return False

            # 构建前端
            result = subprocess.run(['npm', 'run', 'build'],
                                  cwd=frontend_path,
                                  capture_output=True, text=True)
            if result.returncode == 0:
                self.logger.success("前端构建完成")
                return True
            else:
                self.logger.error(f"前端构建失败: {result.stderr}")
                return False
        except Exception as e:
            self.logger.error(f"前端构建失败: {e}")
            return False

    def check_redis_availability(self) -> bool:
        """检查Redis可用性"""
        redis_host = self.config_manager.get_env_value('REDIS_HOST', 'localhost')
        redis_port = int(self.config_manager.get_env_value('REDIS_PORT', '6379'))

        if self.system_checker.check_redis_connection(redis_host, redis_port):
            self.logger.success(f"Redis连接正常 ({redis_host}:{redis_port})")
            return True
        else:
            self.logger.warning(f"Redis连接失败 ({redis_host}:{redis_port})")
            return False