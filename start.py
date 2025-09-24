#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Claude Relay Service 一键启动脚本

支持开发、生产、Docker、服务管理等多种启动模式
使用方式：
    python start.py dev          # 开发模式
    python start.py prod         # 生产模式
    python start.py docker       # Docker模式
    python start.py service      # 服务管理模式
"""

import os
import sys
import time
import signal
import argparse
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Any

# 添加scripts目录到Python路径
sys.path.insert(0, str(Path(__file__).parent / 'scripts'))

from start_utils import (
    Logger, SystemChecker, ConfigManager, ProcessManager, ServiceStarter,
    Colors
)


class ClaudeRelayStarter:
    """Claude Relay Service 启动器主类"""

    def __init__(self):
        self.project_root = Path(__file__).parent
        self.logger = Logger()
        self.system_checker = SystemChecker()
        self.config_manager = ConfigManager(self.project_root)
        self.process_manager = ProcessManager(self.project_root)
        self.service_starter = ServiceStarter(self.project_root)
        self.current_process: Optional[subprocess.Popen] = None

        # 注册信号处理器
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

    def _signal_handler(self, signum, frame):
        """信号处理器"""
        self.logger.info("接收到退出信号，正在优雅关闭...")
        if self.current_process:
            self.current_process.terminate()
        sys.exit(0)

    def _run_system_check(self) -> bool:
        """运行系统检查"""
        self.logger.header("系统环境检查")

        # 检查Node.js
        node_ok, node_info = self.system_checker.check_node_version()
        if node_ok:
            self.logger.success(f"Node.js版本: {node_info}")
        else:
            self.logger.error(f"Node.js检查失败: {node_info}")
            return False

        # 检查npm
        npm_ok, npm_info = self.system_checker.check_npm_installed()
        if npm_ok:
            self.logger.success(f"npm版本: {npm_info}")
        else:
            self.logger.error(f"npm检查失败: {npm_info}")
            return False

        return True

    def _check_port_conflicts(self, port: int) -> bool:
        """检查端口冲突"""
        if not self.system_checker.check_port_available(port):
            self.logger.error(f"端口 {port} 已被占用")

            # 尝试查找占用进程
            try:
                if sys.platform == 'win32':
                    result = subprocess.run(['netstat', '-ano'],
                                          capture_output=True, text=True)
                    for line in result.stdout.split('\n'):
                        if f':{port}' in line and 'LISTENING' in line:
                            parts = line.split()
                            if len(parts) >= 5:
                                pid = parts[-1]
                                self.logger.warning(f"端口被进程PID {pid} 占用")
                else:
                    result = subprocess.run(['lsof', '-i', f':{port}'],
                                          capture_output=True, text=True)
                    if result.stdout:
                        self.logger.warning(f"端口占用详情:\n{result.stdout}")
            except Exception:
                pass

            return False
        return True

    def start_dev_mode(self, args) -> bool:
        """启动开发模式"""
        self.logger.header("启动开发模式")

        # 系统检查
        if not self._run_system_check():
            return False

        # 准备环境
        if not self.service_starter.prepare_environment():
            return False

        # 安装依赖
        if not self.service_starter.install_dependencies():
            return False

        # 构建前端
        if not self.service_starter.build_frontend():
            return False

        # 检查Redis
        if not self.service_starter.check_redis_availability():
            self.logger.warning("Redis未连接，请确保Redis服务正在运行")
            if input("是否继续启动? (y/N): ").lower() != 'y':
                return False

        # 检查端口
        port = getattr(args, 'port', 3000)
        if not self._check_port_conflicts(port):
            return False

        # 启动开发服务器
        self.logger.info("启动开发服务器...")
        try:
            env = os.environ.copy()
            env['NODE_ENV'] = 'development'
            if hasattr(args, 'port'):
                env['PORT'] = str(args.port)

            # 使用nodemon启动
            cmd = ['npm', 'run', 'dev']
            self.logger.debug(f"执行命令: {' '.join(cmd)}")

            self.current_process = subprocess.Popen(
                cmd,
                cwd=self.project_root,
                env=env
            )

            self.logger.success(f"开发服务器启动成功 (PID: {self.current_process.pid})")
            self.logger.info(f"服务地址: http://localhost:{port}")
            self.logger.info("按 Ctrl+C 停止服务")

            # 等待进程结束
            self.current_process.wait()
            return True

        except KeyboardInterrupt:
            self.logger.info("用户中断")
            return True
        except Exception as e:
            self.logger.error(f"启动开发服务器失败: {e}")
            return False

    def start_prod_mode(self, args) -> bool:
        """启动生产模式"""
        self.logger.header("启动生产模式")

        # 系统检查
        if not self._run_system_check():
            return False

        # 准备环境
        if not self.service_starter.prepare_environment():
            return False

        # 安装依赖
        if not self.service_starter.install_dependencies():
            return False

        # 构建前端
        if not self.service_starter.build_frontend():
            return False

        # 检查Redis
        if not self.service_starter.check_redis_availability():
            self.logger.error("生产模式需要Redis连接")
            return False

        # 检查端口
        port = getattr(args, 'port', 3000)
        if not self._check_port_conflicts(port):
            return False

        # 启动生产服务器
        daemon = getattr(args, 'daemon', False)

        if daemon:
            self.logger.info("启动后台生产服务器...")
            try:
                env = os.environ.copy()
                env['NODE_ENV'] = 'production'
                if hasattr(args, 'port'):
                    env['PORT'] = str(args.port)

                cmd = ['npm', 'run', 'service:start:daemon']
                result = subprocess.run(cmd, cwd=self.project_root, env=env)

                if result.returncode == 0:
                    self.logger.success("后台生产服务器启动成功")
                    return True
                else:
                    self.logger.error("后台生产服务器启动失败")
                    return False
            except Exception as e:
                self.logger.error(f"启动后台生产服务器失败: {e}")
                return False
        else:
            self.logger.info("启动前台生产服务器...")
            try:
                env = os.environ.copy()
                env['NODE_ENV'] = 'production'
                if hasattr(args, 'port'):
                    env['PORT'] = str(args.port)

                cmd = ['npm', 'start']
                self.logger.debug(f"执行命令: {' '.join(cmd)}")

                self.current_process = subprocess.Popen(
                    cmd,
                    cwd=self.project_root,
                    env=env
                )

                self.logger.success(f"生产服务器启动成功 (PID: {self.current_process.pid})")
                self.logger.info(f"服务地址: http://localhost:{port}")
                self.logger.info("按 Ctrl+C 停止服务")

                # 等待进程结束
                self.current_process.wait()
                return True

            except KeyboardInterrupt:
                self.logger.info("用户中断")
                return True
            except Exception as e:
                self.logger.error(f"启动生产服务器失败: {e}")
                return False

    def start_docker_mode(self, args) -> bool:
        """启动Docker模式"""
        self.logger.header("启动Docker模式")

        # 检查Docker
        docker_ok, docker_info = self.system_checker.check_docker_installed()
        if not docker_ok:
            self.logger.error(f"Docker检查失败: {docker_info}")
            return False
        self.logger.success(f"Docker版本: {docker_info}")

        compose_ok, compose_info = self.system_checker.check_docker_compose_installed()
        if not compose_ok:
            self.logger.error(f"Docker Compose检查失败: {compose_info}")
            return False
        self.logger.success(f"Docker Compose版本: {compose_info}")

        rebuild = getattr(args, 'rebuild', False)

        try:
            if rebuild:
                self.logger.info("重新构建Docker镜像...")
                result = subprocess.run(['docker-compose', 'build'],
                                      cwd=self.project_root)
                if result.returncode != 0:
                    self.logger.error("Docker镜像构建失败")
                    return False

            self.logger.info("启动Docker容器...")
            cmd = ['docker-compose', 'up']
            if getattr(args, 'daemon', False):
                cmd.append('-d')

            self.current_process = subprocess.Popen(cmd, cwd=self.project_root)

            if getattr(args, 'daemon', False):
                self.current_process.wait()
                self.logger.success("Docker容器已在后台启动")
            else:
                self.logger.success("Docker容器启动成功")
                self.logger.info("按 Ctrl+C 停止容器")
                self.current_process.wait()

            return True

        except KeyboardInterrupt:
            self.logger.info("用户中断")
            subprocess.run(['docker-compose', 'down'], cwd=self.project_root)
            return True
        except Exception as e:
            self.logger.error(f"Docker启动失败: {e}")
            return False

    def manage_service(self, action: str) -> bool:
        """服务管理"""
        self.logger.header(f"服务管理 - {action}")

        cmd = ['npm', 'run', f'service:{action}']

        try:
            result = subprocess.run(cmd, cwd=self.project_root)
            return result.returncode == 0
        except Exception as e:
            self.logger.error(f"服务管理失败: {e}")
            return False

    def show_status(self) -> bool:
        """显示状态"""
        self.logger.header("系统状态")

        # 显示系统信息
        system_info = self.system_checker.get_system_info()
        self.logger.info(f"操作系统: {system_info['platform']} {system_info['architecture']}")
        self.logger.info(f"Python版本: {system_info['python_version']}")
        self.logger.info(f"项目路径: {system_info['project_root']}")

        # 显示Node.js状态
        node_ok, node_info = self.system_checker.check_node_version()
        status = "✅" if node_ok else "❌"
        self.logger.info(f"Node.js: {status} {node_info}")

        # 显示Redis状态
        redis_ok = self.service_starter.check_redis_availability()
        status = "✅" if redis_ok else "❌"
        self.logger.info(f"Redis: {status}")

        # 显示服务状态
        pid = self.process_manager.get_running_pid()
        if pid:
            self.logger.success(f"服务运行中 (PID: {pid})")
        else:
            self.logger.warning("服务未运行")

        # 显示端口状态
        port = 3000
        port_ok = self.system_checker.check_port_available(port)
        status = "空闲" if port_ok else "占用"
        self.logger.info(f"端口 {port}: {status}")

        return True


def create_parser() -> argparse.ArgumentParser:
    """创建命令行参数解析器"""
    parser = argparse.ArgumentParser(
        description='Claude Relay Service 一键启动脚本',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例:
  python start.py dev                    # 开发模式
  python start.py dev --port 3001       # 开发模式指定端口
  python start.py prod                   # 生产模式
  python start.py prod --daemon          # 生产模式后台运行
  python start.py docker                 # Docker模式
  python start.py docker --rebuild       # Docker模式重新构建
  python start.py service start          # 启动服务
  python start.py service stop           # 停止服务
  python start.py service status         # 查看服务状态
  python start.py status                 # 显示系统状态
        """
    )

    subparsers = parser.add_subparsers(dest='mode', help='启动模式')

    # 开发模式
    dev_parser = subparsers.add_parser('dev', help='开发模式')
    dev_parser.add_argument('--port', type=int, default=3000, help='服务端口')

    # 生产模式
    prod_parser = subparsers.add_parser('prod', help='生产模式')
    prod_parser.add_argument('--port', type=int, default=3000, help='服务端口')
    prod_parser.add_argument('--daemon', action='store_true', help='后台运行')

    # Docker模式
    docker_parser = subparsers.add_parser('docker', help='Docker模式')
    docker_parser.add_argument('--rebuild', action='store_true', help='重新构建镜像')
    docker_parser.add_argument('--daemon', action='store_true', help='后台运行')

    # 服务管理模式
    service_parser = subparsers.add_parser('service', help='服务管理')
    service_parser.add_argument('action', choices=['start', 'stop', 'restart', 'status', 'logs'],
                               help='服务操作')

    # 状态查看
    subparsers.add_parser('status', help='显示系统状态')

    return parser


def main():
    """主函数"""
    parser = create_parser()
    args = parser.parse_args()

    # 如果没有指定模式，显示帮助信息和常用命令
    if not args.mode:
        print(f"{Colors.BOLD}{Colors.BLUE}🚀 Claude Relay Service 一键启动脚本{Colors.END}\n")
        print(f"{Colors.CYAN}请指定启动模式，常用命令：{Colors.END}")
        print(f"  {Colors.GREEN}python3 start.py dev{Colors.END}      # 开发模式")
        print(f"  {Colors.GREEN}python3 start.py prod{Colors.END}     # 生产模式")
        print(f"  {Colors.GREEN}python3 start.py status{Colors.END}   # 系统状态")
        print(f"  {Colors.GREEN}python3 start.py --help{Colors.END}   # 查看帮助")
        print()
        parser.print_help()
        return

    starter = ClaudeRelayStarter()

    try:
        if args.mode == 'dev':
            success = starter.start_dev_mode(args)
        elif args.mode == 'prod':
            success = starter.start_prod_mode(args)
        elif args.mode == 'docker':
            success = starter.start_docker_mode(args)
        elif args.mode == 'service':
            success = starter.manage_service(args.action)
        elif args.mode == 'status':
            success = starter.show_status()
        else:
            parser.print_help()
            return

        if not success:
            sys.exit(1)

    except KeyboardInterrupt:
        starter.logger.info("用户中断")
    except Exception as e:
        starter.logger.error(f"启动失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()