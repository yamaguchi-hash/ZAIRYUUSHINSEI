"use client";

import React, { useState, useTransition, useEffect } from "react";
import {
  Calendar,
  Clock,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Check,
  X,
  FileText,
  DollarSign,
  FileCheck,
} from "lucide-react";
import {
  getCaseNotes,
  addCaseNote,
  updateCaseNote,
  deleteCaseNote,
  getCaseExpenses,
  addCaseExpense,
  updateCaseExpense,
  deleteCaseExpense,
  getCaseRemarks,
  addCaseRemark,
  updateCaseRemark,
  deleteCaseRemark,
  getCaseInformation,
  updateCaseInformation,
} from "@/actions/case-notes";

interface CaseNote {
  id: string;
  entryDate: string | Date;
  entryTime: string | null;
  content: string;
  name: string | null;
  assignee: string | null;
}

interface CaseExpense {
  id: string;
  expenseDate: string | Date;
  item1: string | null;
  item2: string | null;
  amount: number | null;
  remarks: string | null;
}

interface CaseRemark {
  id: string;
  content: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface CaseInfo {
  id: string;
  estimatedAmount: number | null;
  actualAmount: number | null;
  taxRate: number;
}

interface Props {
  applicationId: string;
}

type Tab = "business" | "expense" | "remarks" | "estimate";

export function CaseNotesPanel({ applicationId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("business");
  const [businessLogs, setBusinessLogs] = useState<CaseNote[]>([]);
  const [expenses, setExpenses] = useState<CaseExpense[]>([]);
  const [remarks, setRemarks] = useState<CaseRemark[]>([]);
  const [caseInfo, setCaseInfo] = useState<CaseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // フォーム状態
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [remarkInput, setRemarkInput] = useState("");
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    entryDate: "",
    entryTime: "",
    content: "",
    name: "",
    assignee: "",
    expenseDate: "",
    item1: "",
    item2: "",
    amount: "",
    remarks: "",
    estimatedAmount: "",
    actualAmount: "",
    taxRate: "10",
  });

  // データ読み込み
  const loadData = async () => {
    try {
      setIsLoading(true);
      setError("");
      console.log("[CaseNotesPanel] Loading data for application:", applicationId);

      const [notesData, expensesData, remarksData, infoData] = await Promise.all([
        getCaseNotes(applicationId).catch(err => {
          console.error("[CaseNotesPanel] Error loading notes:", err);
          throw err;
        }),
        getCaseExpenses(applicationId).catch(err => {
          console.error("[CaseNotesPanel] Error loading expenses:", err);
          throw err;
        }),
        getCaseRemarks(applicationId).catch(err => {
          console.error("[CaseNotesPanel] Error loading remarks:", err);
          throw err;
        }),
        getCaseInformation(applicationId).catch(err => {
          console.error("[CaseNotesPanel] Error loading information:", err);
          throw err;
        }),
      ]);

      console.log("[CaseNotesPanel] Data loaded successfully:", {
        notesCount: notesData?.length,
        expensesCount: expensesData?.length,
        remarksCount: remarksData?.length,
        hasInfo: !!infoData,
      });

      setBusinessLogs(notesData || []);
      setExpenses(expensesData || []);
      setRemarks(remarksData || []);
      setCaseInfo(infoData || null);

      if (infoData) {
        setFormData((prev) => ({
          ...prev,
          estimatedAmount: infoData.estimatedAmount?.toString() || "",
          actualAmount: infoData.actualAmount?.toString() || "",
          taxRate: (infoData.taxRate * 100).toString(),
        }));
      }
    } catch (err: any) {
      const errorMsg = err.message || "データ読み込みエラー";
      console.error("[CaseNotesPanel] Fatal error:", errorMsg, err);
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // 初期読み込み
  useEffect(() => {
    loadData();
  }, [applicationId]);

  // 業務履歴操作
  const resetBusinessForm = () => {
    setFormData((prev) => ({
      ...prev,
      entryDate: "",
      entryTime: "",
      content: "",
      name: "",
      assignee: "",
    }));
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSaveBusinessLog = () => {
    if (!formData.entryDate.trim() || !formData.content.trim()) {
      setError("記録日と内容は必須です");
      return;
    }

    startTransition(async () => {
      try {
        if (editingId) {
          const updated = await updateCaseNote(applicationId, editingId, {
            entryDate: formData.entryDate,
            entryTime: formData.entryTime || undefined,
            content: formData.content,
            name: formData.name || undefined,
            assignee: formData.assignee || undefined,
          });
          setBusinessLogs(businessLogs.map((n) => (n.id === editingId ? updated : n)));
        } else {
          const added = await addCaseNote(applicationId, {
            entryDate: formData.entryDate,
            entryTime: formData.entryTime || undefined,
            content: formData.content,
            name: formData.name || undefined,
            assignee: formData.assignee || undefined,
          });
          setBusinessLogs([...businessLogs, added]);
        }
        resetBusinessForm();
      } catch (err: any) {
        setError(err.message || "操作に失敗しました");
      }
    });
  };

  // 経費操作
  const resetExpenseForm = () => {
    setFormData((prev) => ({
      ...prev,
      expenseDate: "",
      item1: "",
      item2: "",
      amount: "",
      remarks: "",
    }));
    setIsAdding(false);
    setEditingId(null);
  };

  const handleSaveExpense = () => {
    if (!formData.expenseDate.trim()) {
      setError("日付は必須です");
      return;
    }

    startTransition(async () => {
      try {
        if (editingId) {
          const updated = await updateCaseExpense(applicationId, editingId, {
            expenseDate: formData.expenseDate,
            item1: formData.item1 || undefined,
            item2: formData.item2 || undefined,
            amount: formData.amount ? parseFloat(formData.amount) : undefined,
            remarks: formData.remarks || undefined,
          });
          setExpenses(expenses.map((e) => (e.id === editingId ? updated : e)));
        } else {
          const added = await addCaseExpense(applicationId, {
            expenseDate: formData.expenseDate,
            item1: formData.item1 || undefined,
            item2: formData.item2 || undefined,
            amount: formData.amount ? parseFloat(formData.amount) : undefined,
            remarks: formData.remarks || undefined,
          });
          setExpenses([...expenses, added]);
        }
        resetExpenseForm();
      } catch (err: any) {
        setError(err.message || "操作に失敗しました");
      }
    });
  };

  // 備考の保存
  const handleSaveRemark = () => {
    if (!remarkInput.trim()) {
      setError("備考を入力してください");
      return;
    }

    startTransition(async () => {
      try {
        if (editingRemarkId) {
          const updated = await updateCaseRemark(applicationId, editingRemarkId, remarkInput);
          setRemarks(remarks.map((r) => (r.id === editingRemarkId ? updated : r)));
          setEditingRemarkId(null);
        } else {
          const added = await addCaseRemark(applicationId, remarkInput);
          if (added) setRemarks([added, ...remarks]);
        }
        setRemarkInput("");
        setError("");
      } catch (err: any) {
        setError(err.message || "保存に失敗しました");
      }
    });
  };

  // 見積額の保存
  const handleSaveEstimate = () => {
    startTransition(async () => {
      try {
        const updated = await updateCaseInformation(applicationId, {
          estimatedAmount: formData.estimatedAmount
            ? parseFloat(formData.estimatedAmount)
            : undefined,
          actualAmount: formData.actualAmount
            ? parseFloat(formData.actualAmount)
            : undefined,
          taxRate: parseInt(formData.taxRate) / 100,
        });
        setCaseInfo(updated);
        setError("");
      } catch (err: any) {
        setError(err.message || "保存に失敗しました");
      }
    });
  };

  // 計算
  const totalAmount = (caseInfo?.actualAmount || 0) * (1 + (caseInfo?.taxRate || 0.1));

  if (isLoading) {
    return (
      <div className="border border-blue-200 rounded-xl bg-blue-50 p-4 text-center">
        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
        データ読み込み中...
      </div>
    );
  }

  return (
    <div className="border border-blue-200 rounded-xl bg-blue-50 overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-blue-200 bg-blue-100">
        <FileText className="w-4 h-4 text-blue-700" />
        <span className="text-sm font-semibold text-blue-800">事件メモ</span>
      </div>

      <div className="p-4">
        {/* タブ */}
        <div className="flex gap-1 mb-4 border-b border-blue-200 overflow-x-auto">
          <button
            onClick={() => setActiveTab("business")}
            className={`px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === "business"
                ? "text-blue-700 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-blue-600"
            }`}
          >
            <Calendar className="w-3.5 h-3.5 inline mr-1" />
            業務履歴
          </button>
          <button
            onClick={() => setActiveTab("expense")}
            className={`px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === "expense"
                ? "text-blue-700 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-blue-600"
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 inline mr-1" />
            経費明細
          </button>
          <button
            onClick={() => setActiveTab("remarks")}
            className={`px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === "remarks"
                ? "text-blue-700 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-blue-600"
            }`}
          >
            <FileCheck className="w-3.5 h-3.5 inline mr-1" />
            備考
          </button>
          <button
            onClick={() => setActiveTab("estimate")}
            className={`px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === "estimate"
                ? "text-blue-700 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-blue-600"
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 inline mr-1" />
            見積額
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-600 mb-3">
            {error}
          </div>
        )}

        {/* 業務履歴タブ */}
        {activeTab === "business" && (
          <div className="space-y-3">
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {businessLogs.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">業務履歴がありません</p>
              ) : (
                businessLogs.map((log) => (
                  <div
                    key={log.id}
                    className="bg-white border border-blue-100 rounded-lg p-2 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Calendar className="w-3.5 h-3.5" />
                        {typeof log.entryDate === "string"
                          ? log.entryDate
                          : new Date(log.entryDate).toLocaleDateString("ja-JP")}
                        {log.entryTime && (
                          <>
                            <Clock className="w-3.5 h-3.5" />
                            {log.entryTime}
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              entryDate: typeof log.entryDate === "string"
                                ? log.entryDate
                                : new Date(log.entryDate).toISOString().split("T")[0],
                              entryTime: log.entryTime || "",
                              content: log.content,
                              name: log.name || "",
                              assignee: log.assignee || "",
                            }));
                            setEditingId(log.id);
                            setIsAdding(false);
                          }}
                          className="p-1 text-gray-400 hover:text-blue-600"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("削除しますか？")) {
                              startTransition(async () => {
                                try {
                                  await deleteCaseNote(applicationId, log.id);
                                  setBusinessLogs(businessLogs.filter((n) => n.id !== log.id));
                                } catch (err: any) {
                                  setError(err.message);
                                }
                              });
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-700">{log.content}</p>
                    {(log.name || log.assignee) && (
                      <div className="flex gap-3 text-xs text-gray-500">
                        {log.name && <span>対象: {log.name}</span>}
                        {log.assignee && <span>担当: {log.assignee}</span>}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {isAdding || editingId ? (
              <div className="bg-white border border-blue-100 rounded-lg p-3 space-y-2">
                <input
                  type="date"
                  value={formData.entryDate}
                  onChange={(e) =>
                    setFormData({ ...formData, entryDate: e.target.value })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                />
                <input
                  type="time"
                  value={formData.entryTime}
                  onChange={(e) =>
                    setFormData({ ...formData, entryTime: e.target.value })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                />
                <textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  rows={2}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                  placeholder="内容を入力"
                />
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                  placeholder="対象の名称"
                />
                <input
                  type="text"
                  value={formData.assignee}
                  onChange={(e) =>
                    setFormData({ ...formData, assignee: e.target.value })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                  placeholder="担当者"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveBusinessLog}
                    disabled={isPending}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
                  >
                    {editingId ? "更新" : "保存"}
                  </button>
                  <button
                    onClick={resetBusinessForm}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setFormData((prev) => ({
                    ...prev,
                    entryDate: new Date().toISOString().split("T")[0],
                  }));
                  setIsAdding(true);
                }}
                className="w-full px-3 py-2 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded"
              >
                <Plus className="w-3.5 h-3.5 inline mr-1" />
                追加
              </button>
            )}
          </div>
        )}

        {/* 経費明細タブ */}
        {activeTab === "expense" && (
          <div className="space-y-3">
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {expenses.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">経費がありません</p>
              ) : (
                expenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="bg-white border border-blue-100 rounded-lg p-2"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">
                        {typeof exp.expenseDate === "string"
                          ? exp.expenseDate
                          : new Date(exp.expenseDate).toLocaleDateString("ja-JP")}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              expenseDate: typeof exp.expenseDate === "string"
                                ? exp.expenseDate
                                : new Date(exp.expenseDate).toISOString().split("T")[0],
                              item1: exp.item1 || "",
                              item2: exp.item2 || "",
                              amount: exp.amount?.toString() || "",
                              remarks: exp.remarks || "",
                            }));
                            setEditingId(exp.id);
                          }}
                          className="p-1 text-gray-400 hover:text-blue-600"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("削除しますか？")) {
                              startTransition(async () => {
                                try {
                                  await deleteCaseExpense(applicationId, exp.id);
                                  setExpenses(expenses.filter((e) => e.id !== exp.id));
                                } catch (err: any) {
                                  setError(err.message);
                                }
                              });
                            }
                          }}
                          className="p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-700 space-y-1">
                      {exp.item1 && <div>{exp.item1}</div>}
                      {exp.item2 && <div>{exp.item2}</div>}
                      {exp.amount && <div className="font-semibold">¥{exp.amount.toLocaleString()}</div>}
                      {exp.remarks && <div className="text-gray-500">{exp.remarks}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>

            {isAdding || editingId ? (
              <div className="bg-white border border-blue-100 rounded-lg p-3 space-y-2">
                <input
                  type="date"
                  value={formData.expenseDate}
                  onChange={(e) =>
                    setFormData({ ...formData, expenseDate: e.target.value })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                />
                <input
                  type="text"
                  value={formData.item1}
                  onChange={(e) =>
                    setFormData({ ...formData, item1: e.target.value })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                  placeholder="項目1"
                />
                <input
                  type="text"
                  value={formData.item2}
                  onChange={(e) =>
                    setFormData({ ...formData, item2: e.target.value })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                  placeholder="項目2"
                />
                <input
                  type="number"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                  placeholder="金額（円）"
                />
                <textarea
                  value={formData.remarks}
                  onChange={(e) =>
                    setFormData({ ...formData, remarks: e.target.value })
                  }
                  rows={1}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                  placeholder="備考"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveExpense}
                    disabled={isPending}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
                  >
                    {editingId ? "更新" : "保存"}
                  </button>
                  <button
                    onClick={resetExpenseForm}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  setFormData((prev) => ({
                    ...prev,
                    expenseDate: new Date().toISOString().split("T")[0],
                  }));
                  setIsAdding(true);
                }}
                className="w-full px-3 py-2 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded"
              >
                <Plus className="w-3.5 h-3.5 inline mr-1" />
                追加
              </button>
            )}
          </div>
        )}

        {/* 備考タブ */}
        {activeTab === "remarks" && (
          <div className="space-y-3">
            {/* 備考一覧 */}
            <div className="space-y-2 max-h-[350px] overflow-y-auto">
              {remarks.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">備考がありません</p>
              ) : (
                remarks.map((remark) => (
                  <div
                    key={remark.id}
                    className="bg-white border border-blue-100 rounded-lg p-2.5 hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => {
                      setRemarkInput(remark.content);
                      setEditingRemarkId(remark.id);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs text-gray-700 flex-1 break-words">{remark.content}</p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("削除しますか？")) {
                            startTransition(async () => {
                              try {
                                await deleteCaseRemark(applicationId, remark.id);
                                setRemarks(remarks.filter((r) => r.id !== remark.id));
                              } catch (err: any) {
                                setError(err.message);
                              }
                            });
                          }
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 flex-shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {typeof remark.createdAt === "string"
                        ? new Date(remark.createdAt).toLocaleString("ja-JP")
                        : remark.createdAt.toLocaleString("ja-JP")}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* 備考入力 */}
            {editingRemarkId || remarkInput ? (
              <div className="bg-white border border-blue-100 rounded-lg p-3 space-y-2">
                <textarea
                  value={remarkInput}
                  onChange={(e) => setRemarkInput(e.target.value)}
                  rows={4}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                  placeholder="備考を入力"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveRemark}
                    disabled={isPending || !remarkInput.trim()}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
                  >
                    <Check className="w-3.5 h-3.5 inline mr-1" />
                    {editingRemarkId ? "更新" : "追加"}
                  </button>
                  <button
                    onClick={() => {
                      setRemarkInput("");
                      setEditingRemarkId(null);
                    }}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
                  >
                    <X className="w-3.5 h-3.5 inline mr-1" />
                    キャンセル
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setRemarkInput("")}
                className="w-full px-3 py-2 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded"
              >
                <Plus className="w-3.5 h-3.5 inline mr-1" />
                新しい備考を追加
              </button>
            )}
          </div>
        )}

        {/* 見積額タブ */}
        {activeTab === "estimate" && (
          <div className="space-y-3">
            <div className="bg-white border border-blue-100 rounded-lg p-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    見積額（円）
                  </label>
                  <input
                    type="number"
                    value={formData.estimatedAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, estimatedAmount: e.target.value })
                    }
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    実費（円）
                  </label>
                  <input
                    type="number"
                    value={formData.actualAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, actualAmount: e.target.value })
                    }
                    className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  消費税率（%）
                </label>
                <input
                  type="number"
                  value={formData.taxRate}
                  onChange={(e) =>
                    setFormData({ ...formData, taxRate: e.target.value })
                  }
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded"
                  min="0"
                  max="100"
                  placeholder="10"
                />
              </div>

              {/* 計算結果 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                <h4 className="text-xs font-semibold text-blue-900">計算結果</h4>
                <div className="space-y-1 text-xs text-gray-700">
                  <div className="flex justify-between">
                    <span>見積額:</span>
                    <span className="font-mono">
                      ¥{(formData.estimatedAmount ? parseFloat(formData.estimatedAmount) : 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>実費:</span>
                    <span className="font-mono">
                      ¥{(formData.actualAmount ? parseFloat(formData.actualAmount) : 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>消費税率:</span>
                    <span className="font-mono">{formData.taxRate}%</span>
                  </div>
                  <div className="border-t border-blue-200 pt-1 mt-1 flex justify-between font-semibold text-blue-900">
                    <span>総額:</span>
                    <span className="font-mono">
                      ¥{totalAmount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleSaveEstimate}
                disabled={isPending}
                className="w-full px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
              >
                <Check className="w-3.5 h-3.5 inline mr-1" />
                保存
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
