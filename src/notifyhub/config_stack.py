from __future__ import annotations

import pydantic as pdt
import typing as tp
import os
import logging
import json
import pandas as pd
import htpy as h
import subprocess
import inspect


class ConfigStack(pdt.BaseModel):
    app_name: tp.ClassVar[str] = "ConfigStack"
    @staticmethod
    def set_nested_dict(data: dict, path: str, value: tp.Any) -> None:
        """Set a nested value in a dict using dotted path."""
        parts = path.split(".")
        for part in parts[:-1]:
            data = data.setdefault(part, {})
        data[parts[-1]] = value

    @classmethod
    def load_layer_02_config_file(cls, config_data: dict) -> None:
        """Load configuration from file."""
        config_file = os.path.expanduser(
            f"~/.config/{cls.app_name.lower()}/config.json"
        )
        if os.path.exists(config_file):
            try:
                with open(config_file, "r") as f:
                    file_config = json.load(f)
                sections = list(cls.model_fields.keys())
                for section_name in sections:
                    if section_name in file_config:
                        for key, value in file_config[section_name].items():
                            if value is not None:
                                cls.set_nested_dict(
                                    config_data, f"{section_name}.{key}", value
                                )
            except Exception as e:
                logging.warning(f"Failed to load config file {config_file}: {e}")

    @classmethod
    def load_layer_03_lower_env(cls, config_data: dict) -> None:
        """Load configuration from lowercase-dotted environment variables."""
        for env_key, path in cls._get_lower_mappings().items():
            if env_key in os.environ:
                try:
                    cls.set_nested_dict(
                        config_data, path, os.environ[env_key]
                    )
                except (ValueError, TypeError):
                    logging.warning(
                        f"Could not set env var {env_key}='{os.environ[env_key]}' to config"
                    )

    @classmethod
    def load_layer_04_upper_env(cls, config_data: dict) -> None:
        """Load configuration from uppercase-underscored environment variables."""
        for env_key, path in cls._get_upper_mappings().items():
            if env_key in os.environ:
                try:
                    cls.set_nested_dict(
                        config_data, path, os.environ[env_key]
                    )
                except (ValueError, TypeError):
                    logging.warning(
                        f"Could not set env var {env_key}='{os.environ[env_key]}' to config"
                    )

    @classmethod
    def load_layer_05_cli_args(
        cls, config_data: dict, cli_args_dict: dict[str, tp.Any]
    ) -> None:
        """Load configuration from CLI arguments."""
        for key, value in cli_args_dict.items():
            if value is not None:
                cls.set_nested_dict(config_data, key, value)

    @classmethod
    def load_config(cls, cli_args_dict: dict[str, tp.Any]) -> "ConfigStack":
        config_data = {}
        cls.load_layer_02_config_file(config_data)
        cls.load_layer_03_lower_env(config_data)
        cls.load_layer_04_upper_env(config_data)
        cls.load_layer_05_cli_args(config_data, cli_args_dict)
        return cls(**config_data)

    @classmethod
    def _collect_config_paths(
        cls, model_cls: tp.Type[pdt.BaseModel], prefix: str = ""
    ) -> list[str]:
        paths: list[str] = []
        for field_name, field_info in model_cls.model_fields.items():
            full_path = f"{prefix}.{field_name}" if prefix else field_name
            annotation = field_info.annotation
            if isinstance(annotation, type) and issubclass(annotation, pdt.BaseModel):
                paths.extend(
                    cls._collect_config_paths(annotation, full_path)
                )
            else:
                paths.append(full_path)
        return paths

    @classmethod
    def _get_lower_mappings(cls) -> dict[str, str]:
        paths = cls._collect_config_paths(cls)
        return {f"{cls.app_name.lower()}.{path}": path for path in paths}

    @classmethod
    def _get_upper_mappings(cls) -> dict[str, str]:
        paths = cls._collect_config_paths(cls)
        return {
            f"{cls.app_name.upper()}_{path.upper().replace('.', '_')}": path
            for path in paths
        }

    @classmethod
    def _flatten_config(
        cls, config_dict: dict[str, tp.Any], prefix: str = ""
    ) -> list[tuple[str, tp.Any]]:
        result: list[tuple[str, tp.Any]] = []
        for key, value in config_dict.items():
            path = f"{prefix}.{key}" if prefix else key
            if isinstance(value, dict):
                result.extend(cls._flatten_config(value, path))
            else:
                result.append((path, value))
        return result

    @classmethod
    def generate_config_mapping_pandas(
        cls, default_dict: dict[str, tp.Any]
    ) -> pd.DataFrame:
        data = []
        for section_name, section_dict in default_dict.items():
            section_flat = cls._flatten_config(section_dict, section_name)
            for path, default in section_flat:
                low = f"{cls.app_name.lower()}.{path}"
                up = f"{cls.app_name.upper()}_{path.upper().replace('.', '_')}"
                def_str = (
                    "null"
                    if default is None
                    else f'"{default}"' if isinstance(default, str) else str(default)
                )
                data.append(
                    {
                        "Config / CLI Args": path,
                        "Lowercase Dotted Envs.": low,
                        "Uppercase Underscored Envs.": up,
                        "Default Value": def_str,
                    }
                )
        df = pd.DataFrame(data)
        return df

    @classmethod
    def generate_markdown(
        cls, output_path: tp.Optional[str] = None
    ) -> None:
        if output_path is None:
            module_file = inspect.getfile(cls)
            output_path = os.path.splitext(module_file)[0] + '.md'
        default_dict = cls.model_validate({}).model_dump()
        df = cls.generate_config_mapping_pandas(default_dict)
        df = df[["Config / CLI Args", "Default Value", "Lowercase Dotted Envs.", "Uppercase Underscored Envs."]]
        rows = [
            h.tr[
                h.td[str(row["Config / CLI Args"])],
                h.td[str(row["Default Value"])],
                h.td[str(row["Lowercase Dotted Envs."])],
                h.td[str(row["Uppercase Underscored Envs."])],
            ]
            for _, row in df.iterrows()
        ]
        table = h.table[
            h.thead[
                h.tr[
                    h.th["Config / CLI Args"],
                    h.th["Default Value"],
                    h.th["Lowercase Dotted Envs."],
                    h.th["Uppercase Underscored Envs."],
                ]
            ],
            h.tbody[rows],
        ]
        table_html = str(table)
        try:
            result = subprocess.run(
                ["npx", "prettier", "--stdin-filepath", "dummy.html"],
                input=table_html,
                text=True,
                capture_output=True,
                check=True,
            )
            formatted_table = result.stdout.strip()
        except (subprocess.CalledProcessError, FileNotFoundError):
            formatted_table = table_html
        md_content = f"# {cls.app_name} Config Mappings\n\n{formatted_table}\n"
        with open(output_path, "w") as f:
            f.write(md_content)
        print(f"Config mapping Markdown generated at {output_path}")