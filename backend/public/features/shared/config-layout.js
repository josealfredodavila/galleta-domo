<link rel="stylesheet" href="../../shared/config-layout.css" />

<style>
    .cfg-profile-card {
        padding: 24px 16px;
        text-align: center;
        border-bottom: 1px solid var(--cfg-border);
    }
    .cfg-profile-avatar {
        width: 90px;
        height: 90px;
        border-radius: 50%;
        background: linear-gradient(135deg, #0F2D1A, #D4AF37);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.2rem;
        color: #fff;
        font-family: 'Orbitron', monospace;
        font-weight: 700;
        margin: 0 auto 14px;
        overflow: hidden;
        border: 3px solid var(--cfg-gold);
        box-shadow: 0 0 30px rgba(212, 175, 55, 0.2);
    }
    .cfg-profile-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
    .cfg-profile-name {
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--cfg-text);
        margin-bottom: 4px;
    }
    .cfg-profile-handle {
        font-size: 0.82rem;
        color: var(--cfg-text-muted);
        margin-bottom: 6px;
    }
    .cfg-profile-bio {
        font-size: 0.78rem;
        color: var(--cfg-text-muted);
        line-height: 1.5;
        max-width: 400px;
        margin: 0 auto;
    }
    .cfg-historial-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid var(--cfg-border);
    }
    .cfg-historial-item:last-child {
        border-bottom: none;
    }
    .cfg-historial-icon {
        font-size: 1.2rem;
        flex-shrink: 0;
    }
    .cfg-historial-info {
        flex: 1;
        min-width: 0;
    }
    .cfg-historial-evento {
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--cfg-text);
    }
    .cfg-historial-meta {
        font-size: 0.65rem;
        color: var(--cfg-text-muted);
        margin-top: 2px;
    }
    .cfg-loading-mini {
        padding: 20px;
        text-align: center;
        color: var(--cfg-text-muted);
        font-size: 0.75rem;
    }
    .cfg-empty-mini {
        padding: 30px 20px;
        text-align: center;
        color: var(--cfg-text-muted);
        font-size: 0.75rem;
    }
    .cfg-empty-mini .icon {
        font-size: 2rem;
        display: block;
        margin-bottom: 8px;
        opacity: 0.4;
    }

    .cfg-edit-input {
        width: 100%;
        padding: 12px 14px;
        background: rgba(0,0,0,0.3);
        border: 1px solid var(--cfg-border);
        border-radius: 10px;
        color: var(--cfg-text);
        font-size: 0.9rem;
        outline: none;
        font-family: 'Inter', sans-serif;
        transition: var(--cfg-transition);
    }
    .cfg-edit-input:focus {
        border-color: var(--cfg-gold);
        background: rgba(0,0,0,0.4);
    }
    .cfg-edit-textarea {
        width: 100%;
        padding: 12px 14px;
        background: rgba(0,0,0,0.3);
        border: 1px solid var(--cfg-border);
        border-radius: 10px;
        color: var(--cfg-text);
        font-size: 0.9rem;
        outline: none;
        font-family: 'Inter', sans-serif;
        resize: vertical;
        min-height: 80px;
        transition: var(--cfg-transition);
    }
    .cfg-edit-textarea:focus {
        border-color: var(--cfg-gold);
        background: rgba(0,0,0,0.4);
    }
    .cfg-edit-label {
        display: block;
        font-size: 0.72rem;
        color: var(--cfg-text-muted);
        margin-bottom: 6px;
        font-weight: 500;
    }
    .cfg-edit-hint {
        font-size: 0.65rem;
        color: var(--cfg-text-dim);
        margin-top: 6px;
        line-height: 1.5;
    }
    .cfg-edit-counter {
        font-size: 0.65rem;
        color: var(--cfg-text-dim);
        margin-top: 4px;
        text-align: right;
    }
    .cfg-edit-error {
        font-size: 0.68rem;
        color: var(--cfg-danger);
        margin-top: 6px;
        display: none;
    }
    .cfg-edit-error.show {
        display: block;
    }
    html:not(.auth-ready) body {
        visibility: hidden;
    }
    html.auth-ready body {
        visibility: visible;
    }
</style>