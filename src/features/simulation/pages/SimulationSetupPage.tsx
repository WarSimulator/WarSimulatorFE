import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../../components/layout/Icon';
import { loadMettDocuments } from '../../../lib/mettStorage';
import type { DeploymentEditorMode, DeploymentSetup } from '../../../types';
import { DeploymentEditor } from '../components/DeploymentEditor';
import { DeploymentSetupPanel } from '../components/DeploymentSetupPanel';
import { MettTcSelector } from '../components/MettTcSelector';
import {
  cloneDeployment,
  createDeploymentDraft,
  createEmptyDeployment,
  duplicateDeployment,
  getAllDeployments,
  replaceDeployments,
  saveDeployment,
} from '../lib/deploymentStorage';

function getNextDeploymentName(existingDeployments: DeploymentSetup[]) {
  const number = existingDeployments.length + 1;
  const baseName = number === 1 ? 'Alpha Deployment' : `Deployment ${number}`;
  const existingNames = new Set(existingDeployments.map((deployment) => deployment.name));

  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let suffix = number + 1;
  while (existingNames.has(`Deployment ${suffix}`)) {
    suffix += 1;
  }
  return `Deployment ${suffix}`;
}

function getCopyDeploymentName(currentName: string, existingDeployments: DeploymentSetup[]) {
  const existingNames = new Set(existingDeployments.map((deployment) => deployment.name));
  const baseName = `${currentName} Copy`;

  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let suffix = 2;
  while (existingNames.has(`${baseName} ${suffix}`)) {
    suffix += 1;
  }
  return `${baseName} ${suffix}`;
}

export function SimulationSetupPage() {
  const navigate = useNavigate();
  const [documents] = useState(() => loadMettDocuments());
  const [selectedDocumentId, setSelectedDocumentId] = useState(() => documents[0]?.id ?? '');
  const [deployments, setDeployments] = useState<DeploymentSetup[]>(() => getAllDeployments());
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | undefined>();
  const [draftDeployment, setDraftDeployment] = useState<DeploymentSetup | undefined>();
  const [editorMode, setEditorMode] = useState<DeploymentEditorMode>({ type: 'select' });
  const [selectedEntityId, setSelectedEntityId] = useState<string | undefined>();
  const [undoStack, setUndoStack] = useState<DeploymentSetup[]>([]);
  const [redoStack, setRedoStack] = useState<DeploymentSetup[]>([]);

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) ?? documents[0];
  const matchingDeployments = useMemo(
    () => deployments.filter((deployment) => deployment.mettTcDocumentId === selectedDocumentId),
    [deployments, selectedDocumentId],
  );
  const selectedDeployment =
    matchingDeployments.find((deployment) => deployment.id === selectedDeploymentId) ?? matchingDeployments[0];

  useEffect(() => {
    if (!selectedDeployment || selectedDeployment.id === selectedDeploymentId) {
      return;
    }

    setSelectedDeploymentId(selectedDeployment.id);
  }, [selectedDeployment, selectedDeploymentId]);

  useEffect(() => {
    if (draftDeployment) {
      document.body.classList.add('deployment-editor-active');
    } else {
      document.body.classList.remove('deployment-editor-active');
    }

    return () => document.body.classList.remove('deployment-editor-active');
  }, [draftDeployment]);

  const refreshDeployments = () => {
    setDeployments(getAllDeployments());
  };

  const toFileName = () => `${selectedDocument?.id.replace(/-/g, '_') ?? 'mett_tc'}.mett`;

  const openCreateEditor = () => {
    setEditorMode({ type: 'select' });
    setSelectedEntityId(undefined);
    setUndoStack([]);
    setRedoStack([]);
    setDraftDeployment({ ...createDeploymentDraft(selectedDocumentId), name: getNextDeploymentName(matchingDeployments) });
  };

  const handleCreateEmptyDeployment = () => {
    const deployment = createEmptyDeployment(selectedDocumentId, getNextDeploymentName(matchingDeployments));
    saveDeployment(deployment);
    setSelectedDeploymentId(deployment.id);
    refreshDeployments();
  };

  const handleDuplicateCurrentDeployment = () => {
    if (!selectedDeployment) return;
    const deployment = duplicateDeployment(selectedDeployment, getCopyDeploymentName(selectedDeployment.name, matchingDeployments));
    saveDeployment(deployment);
    setSelectedDeploymentId(deployment.id);
    refreshDeployments();
  };

  const handleCloseDeployment = (deploymentId: string) => {
    const closingIndex = matchingDeployments.findIndex((deployment) => deployment.id === deploymentId);
    const fallbackDeployment =
      matchingDeployments[closingIndex + 1] ?? matchingDeployments[closingIndex - 1] ?? matchingDeployments.find((deployment) => deployment.id !== deploymentId);
    const nextDeployments = deployments.filter((deployment) => deployment.id !== deploymentId);

    replaceDeployments(nextDeployments);
    setDeployments(nextDeployments);

    if (selectedDeploymentId === deploymentId) {
      setSelectedDeploymentId(fallbackDeployment?.id);
    }
  };

  const openEditEditor = () => {
    if (!selectedDeployment) {
      return;
    }

    setEditorMode({ type: 'select' });
    setSelectedEntityId(undefined);
    setUndoStack([]);
    setRedoStack([]);
    setDraftDeployment(cloneDeployment(selectedDeployment));
  };

  const updateDraftDeployment = (nextDeployment: DeploymentSetup) => {
    setDraftDeployment((current) => {
      if (current) {
        setUndoStack((stack) => [...stack, current]);
        setRedoStack([]);
      }
      return nextDeployment;
    });
  };

  const handleUndo = () => {
    setUndoStack((stack) => {
      const previous = stack.at(-1);
      if (!previous) return stack;
      setDraftDeployment((current) => {
        if (current) setRedoStack((redo) => [...redo, current]);
        return previous;
      });
      return stack.slice(0, -1);
    });
  };

  const handleRedo = () => {
    setRedoStack((stack) => {
      const next = stack.at(-1);
      if (!next) return stack;
      setDraftDeployment((current) => {
        if (current) setUndoStack((undo) => [...undo, current]);
        return next;
      });
      return stack.slice(0, -1);
    });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!draftDeployment) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      if (event.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [draftDeployment]);

  const handleSaveDeployment = () => {
    if (!draftDeployment) {
      return;
    }

    const nextDeployment = {
      ...draftDeployment,
      updatedAt: new Date().toISOString(),
    };
    saveDeployment(nextDeployment);
    setSelectedDeploymentId(nextDeployment.id);
    setDraftDeployment(undefined);
    refreshDeployments();
  };

  return (
    <div className="mx-auto flex h-full max-w-[1440px] flex-col gap-4 overflow-hidden p-container-padding">
      <div className="flex items-end justify-between border-b border-outline-variant pb-3">
        <div>
          <h2 className="flex items-center gap-2 font-display-lg text-display-lg tracking-tight text-primary">
            <Icon name="play_circle" className="text-[28px]" />
            SIMULATION SETUP
          </h2>
          <p className="mt-1 font-body-base text-body-base text-on-surface-variant">METT-TC document and initial force deployment setup.</p>
        </div>
      </div>

      <div className="flex shrink-0 items-end justify-between gap-4">
        <MettTcSelector
          documents={documents}
          selectedId={selectedDocumentId}
          onSelect={(documentId) => {
            setSelectedDocumentId(documentId);
            setSelectedDeploymentId(undefined);
          }}
        />
        <button
          className="h-[42px] rounded bg-secondary px-6 font-label-caps text-label-caps text-on-secondary transition-colors enabled:hover:bg-secondary-container disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!selectedDocument || !selectedDeployment}
          onClick={() => navigate('/simulations/demo-001/run')}
        >
          START SIMULATION
        </button>
      </div>

      <DeploymentSetupPanel
        deployment={selectedDeployment}
        deployments={matchingDeployments}
        activeDeploymentId={selectedDeployment?.id}
        onSelectDeployment={setSelectedDeploymentId}
        onCreateEmptyDeployment={handleCreateEmptyDeployment}
        onDuplicateCurrentDeployment={handleDuplicateCurrentDeployment}
        onCloseDeployment={handleCloseDeployment}
        onCreate={openCreateEditor}
        onEdit={openEditEditor}
      />

      {draftDeployment && (
        <DeploymentEditor
          draft={draftDeployment}
          mettTcLabel={toFileName()}
          mode={editorMode}
          selectedEntityId={selectedEntityId}
          onDraftChange={updateDraftDeployment}
          onModeChange={setEditorMode}
          onSelectEntity={(entityId) => {
            setSelectedEntityId(entityId);
          }}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          onCancel={() => setDraftDeployment(undefined)}
          onSave={handleSaveDeployment}
        />
      )}
    </div>
  );
}
