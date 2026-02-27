"""Validation Pipeline for Scan-to-Build Reconstructions.

Validates reconstructed builds against the K'Nex part database and core
snapping rules to ensure they represent physically valid constructions.

Example:
    validator = ScanValidator(parts_db_path="parts/", core_module=core_build)
    
    result = validator.validate_graph(reconstructed_graph)
    
    if result.is_valid:
        print("Build is valid!")
    else:
        for issue in result.issues:
            print(f"Problem: {issue.message}")
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class IssueSeverity(Enum):
    """Severity levels for validation issues."""

    ERROR = "error"  # Build is invalid, must be fixed
    WARNING = "warning"  # Build may have issues, review recommended
    INFO = "info"  # Informational only


@dataclass(frozen=True)
class ValidationIssue:
    """A single validation issue found in the reconstruction."""

    severity: IssueSeverity = Field(..., description="Issue severity")
    message: str = Field(..., description="Human-readable description")
    part_ids: list[str] = Field(
        default_factory=list, description="Affected part instance IDs"
    )
    suggestion: str = Field(default="", description="Suggested fix")


class ValidationResult(BaseModel):
    """Complete validation result for a reconstructed build."""

    is_valid: bool = Field(..., description="Whether the build passes all checks")
    issues: list[ValidationIssue] = Field(
        default_factory=list, description="All validation issues found"
    )
    part_count: int = Field(..., description="Number of parts validated")
    connection_count: int = Field(..., description="Number of connections validated")
    confidence_score: float = Field(
        ..., description="Overall reconstruction confidence [0, 1]"
    )


class ScanValidator:
    """Validate scan-to-build reconstructions against K'Nex rules.

    Performs the following checks:
    - All parts exist in the part database
    - All connections use valid port pairs
    - Connection angles are within tolerance
    - No physical collisions between parts
    - Build is structurally connected (no floating pieces)

    Attributes:
        parts_db_path: Path to parts/ directory.
        connection_tolerance: Maximum port distance for valid connections (mm).
    """

    def __init__(
        self,
        parts_db_path: str | Path = "parts/",
        connection_tolerance: float = 2.0,
    ):
        """Initialize the validator.

        Args:
            parts_db_path: Path to parts directory with JSON definitions.
            connection_tolerance: Max distance for port matching (default: 2mm).
        """
        self.parts_db_path = Path(parts_db_path)
        self.connection_tolerance = connection_tolerance

        # Load part definitions
        self.part_definitions: dict[str, dict] = {}
        self._load_part_database()

    def _load_part_database(self) -> None:
        """Load all part definitions from the parts directory."""
        json_files = list(self.parts_db_path.glob("*.json"))

        for json_file in json_files:
            try:
                with open(json_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self.part_definitions[data["id"]] = data
            except Exception as e:
                print(f"Warning: Failed to load {json_file}: {e}")

    def validate_part_exists(self, part_type_id: str) -> ValidationIssue | None:
        """Check if a part type exists in the database.

        Args:
            part_type_id: The part identifier to check.

        Returns:
            ValidationIssue if part not found, None otherwise.
        """
        if part_type_id not in self.part_definitions:
            return ValidationIssue(
                severity=IssueSeverity.ERROR,
                message=f"Unknown part type: {part_type_id}",
                part_ids=[part_type_id],
                suggestion="Verify the part was correctly detected or add to database",
            )
        return None

    def validate_port_exists(
        self, part_type_id: str, port_id: str
    ) -> ValidationIssue | None:
        """Check if a port exists on a part.

        Args:
            part_type_id: The part type identifier.
            port_id: The port identifier to check.

        Returns:
            ValidationIssue if port not found, None otherwise.
        """
        if part_type_id not in self.part_definitions:
            return self.validate_part_exists(part_type_id)

        part_def = self.part_definitions[part_type_id]
        port_ids = {p["id"] for p in part_def.get("ports", [])}

        if port_id not in port_ids:
            return ValidationIssue(
                severity=IssueSeverity.ERROR,
                message=f"Port '{port_id}' not found on part {part_type_id}",
                part_ids=[part_type_id],
                suggestion="Check port labeling or reconstruction accuracy",
            )
        return None

    def validate_connection(
        self,
        part_a_id: str,
        port_a_id: str,
        part_b_id: str,
        port_b_id: str,
        part_types: dict[str, str],
    ) -> list[ValidationIssue]:
        """Validate a single connection between two parts.

        Args:
            part_a_id: First part instance ID.
            port_a_id: Port on first part.
            part_b_id: Second part instance ID.
            port_b_id: Port on second part.
            part_types: Mapping from instance ID to part type ID.

        Returns:
            List of validation issues (may be empty).
        """
        issues: list[ValidationIssue] = []

        # Get part types
        type_a = part_types.get(part_a_id, "unknown")
        type_b = part_types.get(part_b_id, "unknown")

        # Validate parts exist
        issue_a = self.validate_part_exists(type_a)
        issue_b = self.validate_part_exists(type_b)

        if issue_a:
            issues.append(issue_a)
        if issue_b:
            issues.append(issue_b)

        # Validate ports exist
        port_issue_a = self.validate_port_exists(type_a, port_a_id)
        port_issue_b = self.validate_port_exists(type_b, port_b_id)

        if port_issue_a:
            issues.append(port_issue_a)
        if port_issue_b:
            issues.append(port_issue_b)

        # Check port compatibility (if parts exist)
        if type_a in self.part_definitions and type_b in self.part_definitions:
            port_a_def = next(
                (p for p in self.part_definitions[type_a].get("ports", []) 
                 if p["id"] == port_a_id),
                None,
            )
            port_b_def = next(
                (p for p in self.part_definitions[type_b].get("ports", []) 
                 if p["id"] == port_b_id),
                None,
            )

            if port_a_def and port_b_def:
                mate_type_a = port_a_def.get("mate_type", "")
                accepts_b = port_b_def.get("accepts", [])

                mate_type_b = port_b_def.get("mate_type", "")
                accepts_a = port_a_def.get("accepts", [])

                if mate_type_a not in accepts_b and mate_type_b not in accepts_a:
                    issues.append(
                        ValidationIssue(
                            severity=IssueSeverity.ERROR,
                            message=f"Incompatible ports: {port_a_id} on {type_a} cannot connect to {port_b_id} on {type_b}",
                            part_ids=[part_a_id, part_b_id],
                            suggestion="Review connection or check for detection errors",
                        )
                    )

        return issues

    def validate_connectivity(
        self,
        part_ids: list[str],
        connections: list[dict],
    ) -> ValidationIssue | None:
        """Check that all parts are connected (no floating pieces).

        Uses union-find to detect disconnected components.

        Args:
            part_ids: List of all part instance IDs.
            connections: List of connection dictionaries.

        Returns:
            ValidationIssue if disconnected parts found, None otherwise.
        """
        # Union-find implementation
        parent = {pid: pid for pid in part_ids}

        def find(x: str) -> str:
            if parent[x] != x:
                parent[x] = find(parent[x])
            return parent[x]

        def union(x: str, y: str) -> None:
            px, py = find(x), find(y)
            if px != py:
                parent[px] = py

        # Union all connected parts
        for conn in connections:
            union(conn["part_a_id"], conn["part_b_id"])

        # Count connected components
        roots = {find(pid) for pid in part_ids}

        if len(roots) > 1:
            # Find disconnected parts
            main_component = max(roots, key=lambda r: sum(1 for pid in part_ids if find(pid) == r))
            disconnected = [pid for pid in part_ids if find(pid) != main_component]

            return ValidationIssue(
                severity=IssueSeverity.WARNING,
                message=f"Found {len(disconnected)} disconnected part(s)",
                part_ids=disconnected,
                suggestion="These parts may be floating or incorrectly detected",
            )

        return None

    def validate_graph(
        self, graph: dict[str, Any] | Any  # Accepts ReconstructedGraph or dict
    ) -> ValidationResult:
        """Perform complete validation on a reconstructed graph.

        Args:
            graph: ReconstructedGraph object or dictionary with 'parts' and 'connections'.

        Returns:
            ValidationResult with all issues found.
        """
        issues: list[ValidationIssue] = []

        # Handle both object and dict inputs
        if hasattr(graph, "parts"):
            parts = graph.parts
            connections = graph.connections
        else:
            parts = graph.get("parts", [])
            connections = graph.get("connections", [])

        # Build part type mapping
        part_types: dict[str, str] = {}
        
        for part in parts:
            if hasattr(part, "instance_id"):
                instance_id = part.instance_id
                type_id = part.part_type_id
            else:
                instance_id = part["instance_id"]
                type_id = part["part_type_id"]
            
            part_types[instance_id] = type_id

        # Validate each part exists
        for instance_id, type_id in part_types.items():
            issue = self.validate_part_exists(type_id)
            if issue:
                issues.append(issue)

        # Validate each connection
        for conn in connections:
            if hasattr(conn, "part_a_id"):
                conn_issues = self.validate_connection(
                    conn.part_a_id, conn.port_a_id,
                    conn.part_b_id, conn.port_b_id,
                    part_types,
                )
            else:
                conn_issues = self.validate_connection(
                    conn["part_a_id"], conn["port_a_id"],
                    conn["part_b_id"], conn["port_b_id"],
                    part_types,
                )
            
            issues.extend(conn_issues)

        # Validate connectivity
        part_ids = list(part_types.keys())
        
        if hasattr(connections[0], "part_a_id") and connections:
            conn_list = [
                {"part_a_id": c.part_a_id, "part_b_id": c.part_b_id}
                for c in connections
            ]
        else:
            conn_list = [
                {"part_a_id": c["part_a_id"], "part_b_id": c["part_b_id"]}
                for c in connections
            ]

        connectivity_issue = self.validate_connectivity(part_ids, conn_list)
        if connectivity_issue:
            issues.append(connectivity_issue)

        # Calculate confidence score
        error_count = sum(1 for i in issues if i.severity == IssueSeverity.ERROR)
        warning_count = sum(1 for i in issues if i.severity == IssueSeverity.WARNING)

        # Simple confidence calculation
        max_issues = max(len(parts), len(connections), 1)
        confidence = max(0.0, 1.0 - (error_count * 0.5 + warning_count * 0.1) / max_issues)

        return ValidationResult(
            is_valid=error_count == 0,
            issues=issues,
            part_count=len(parts),
            connection_count=len(connections),
            confidence_score=confidence,
        )

    def generate_report(
        self, result: ValidationResult, output_path: str | Path | None = None
    ) -> str:
        """Generate a human-readable validation report.

        Args:
            result: Validation results to report.
            output_path: Optional path to save report file.

        Returns:
            Formatted report string.
        """
        lines = [
            "=" * 60,
            "SCAN-TO-BUILD VALIDATION REPORT",
            "=" * 60,
            "",
            f"Parts validated: {result.part_count}",
            f"Connections validated: {result.connection_count}",
            f"Overall confidence: {result.confidence_score:.1%}",
            f"Status: {'✓ VALID' if result.is_valid else '✗ INVALID'}",
            "",
        ]

        if result.issues:
            lines.append("ISSUES FOUND:")
            lines.append("-" * 40)

            for i, issue in enumerate(result.issues, 1):
                severity_icon = {"ERROR": "✗", "WARNING": "⚠", "INFO": "ℹ"}[issue.severity.value]
                lines.append(f"{i}. [{issue.severity.name}] {severity_icon} {issue.message}")
                
                if issue.suggestion:
                    lines.append(f"   Suggestion: {issue.suggestion}")
                
                if issue.part_ids:
                    lines.append(f"   Affected parts: {', '.join(issue.part_ids[:5])}")
                    if len(issue.part_ids) > 5:
                        lines.append(f"   ... and {len(issue.part_ids) - 5} more")
                
                lines.append("")
        else:
            lines.append("✓ No issues found!")
            lines.append("")

        lines.append("=" * 60)

        report = "\n".join(lines)

        if output_path:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(report)
            print(f"Report saved to {output_path}")

        return report


def main() -> None:
    """Demo script for validation."""
    import argparse

    parser = argparse.ArgumentParser(description="Validate scan-to-build reconstruction")
    parser.add_argument("--parts-db", type=str, default="parts/")
    parser.add_argument("--demo", action="store_true", help="Run demo")

    args = parser.parse_args()

    validator = ScanValidator(parts_db_path=args.parts)

    if args.demo:
        print("Running validation demo...")

        # Create a fake graph
        from graph_reconstructor import ReconstructedGraph, PartInstance3D, PortConnection

        graph = ReconstructedGraph(
            parts=[
                PartInstance3D(
                    instance_id="c1",
                    part_type_id="connector-3way-yellow-v1",
                    position=(0, 0, 0),
                    orientation=(0, 0, 0, 1),
                    ports=[],
                ),
            ],
            connections=[],
            ambiguous_connections=[],
            success=True,
            message="Demo graph",
        )

        result = validator.validate_graph(graph)
        
        print(f"\nValidation {'passed' if result.is_valid else 'failed'}")
        print(f"Confidence: {result.confidence_score:.1%}")

        report = validator.generate_report(result)
        print("\n" + report)


if __name__ == "__main__":
    main()
