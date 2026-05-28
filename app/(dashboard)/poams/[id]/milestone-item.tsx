"use client";

import { useTransition } from "react";
import { format } from "date-fns";
import { completeMilestone, deleteMilestone, type Milestone } from "./actions";
import { Check, Trash2 } from "lucide-react";

interface MilestoneItemProps {
  poamId:   string;
  milestone: Milestone;
  editable:  boolean;
}

export function MilestoneItem({ poamId, milestone, editable }: MilestoneItemProps) {
  const [isPendingToggle, startToggle] = useTransition();
  const [isPendingDelete, startDelete] = useTransition();

  const handleToggle = () => {
    startToggle(() => {
      void completeMilestone(poamId, milestone.id, !milestone.completed);
    });
  };

  const handleDelete = () => {
    if (!confirm("Remove this milestone?")) return;
    startDelete(() => {
      void deleteMilestone(poamId, milestone.id);
    });
  };

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
      milestone.completed ? "border-border bg-muted/30" : "border-border"
    }`}>
      {/* Completion toggle */}
      {editable ? (
        <button
          onClick={handleToggle}
          disabled={isPendingToggle}
          aria-label={milestone.completed ? "Mark incomplete" : "Mark complete"}
          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
            milestone.completed
              ? "border-green-600 bg-green-600 text-white"
              : "border-border hover:border-primary"
          } disabled:opacity-50`}
        >
          {milestone.completed && <Check size={10} strokeWidth={3} aria-hidden="true" />}
        </button>
      ) : (
        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
          milestone.completed ? "border-green-600 bg-green-600 text-white" : "border-border"
        }`}>
          {milestone.completed && <Check size={10} strokeWidth={3} aria-hidden="true" />}
        </span>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${milestone.completed ? "line-through text-muted-foreground" : ""}`}>
          {milestone.description}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Target: {format(new Date(milestone.target_date), "MMM d, yyyy")}
          {milestone.completed && milestone.completed_date && (
            <> · Completed: {format(new Date(milestone.completed_date), "MMM d, yyyy")}</>
          )}
        </p>
      </div>

      {/* Delete */}
      {editable && (
        <button
          onClick={handleDelete}
          disabled={isPendingDelete}
          aria-label="Delete milestone"
          className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
