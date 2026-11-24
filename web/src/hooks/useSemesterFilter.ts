import { useEffect, useMemo, useState } from "react";
import { getSemesters, getUniversity, type Semester } from "../services/campus.js";

export interface SemesterFilterState {
  semesters: Semester[];
  currentTerm: string;
  selectedTerm: string;
  selectedSemester: Semester | null;
  loading: boolean;
  setSelectedTerm: (term: string) => void;
}

export function useSemesterFilter(token: string): SemesterFilterState {
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [currentTerm, setCurrentTerm] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setSemesters([]);
      setCurrentTerm("");
      setSelectedTerm("");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    Promise.allSettled([getUniversity(token), getSemesters(token)]).then(([universityResult, semestersResult]) => {
      if (!active) return;

      const universityTerm = universityResult.status === "fulfilled" ? universityResult.value.currentTerm : "";
      const catalog = semestersResult.status === "fulfilled" ? semestersResult.value.items : [];
      const resolvedCurrentTerm =
        catalog.find((semester) => semester.name === universityTerm)?.name ?? catalog[0]?.name ?? "";
      setCurrentTerm(resolvedCurrentTerm);
      setSemesters(catalog);
      setSelectedTerm((current) =>
        current && catalog.some((semester) => semester.name === current)
          ? current
          : resolvedCurrentTerm || catalog[0]?.name || "",
      );
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [token]);

  const selectedSemester = useMemo(
    () => semesters.find((semester) => semester.name === selectedTerm) ?? null,
    [selectedTerm, semesters],
  );

  return { semesters, currentTerm, selectedTerm, selectedSemester, loading, setSelectedTerm };
}

export function isDateInSemester(value: string | null | undefined, semester: Semester | null): boolean {
  if (!semester || !value || !semester.startOn || !semester.endOn) return true;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return true;
  const valueDate = /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : parsed.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valueDate)) return true;
  return valueDate >= semester.startOn && valueDate <= semester.endOn;
}
