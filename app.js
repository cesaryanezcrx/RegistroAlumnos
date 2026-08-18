/**
 * ==========================================================================
 * LÓGICA DE NEGOCIO - REGISTRO DE ALUMNOS (CBTis)
 * Almacenamiento: Base de Datos independiente por Grupo en IndexedDB.
 * Notificaciones Toast custom, modals premium y búsqueda interactiva.
 * Lector de Códigos QR (Html5Qrcode scanner & file decode).
 * ==========================================================================
 */

// --- GESTOR DE BASES DE DATOS INDEPENDIENTES POR GRUPO (IndexedDB) ---
const GroupDBManager = {
    DB_PREFIX: 'CBTis_DB_Grupo_',
    STORE_NAME: 'alumnos',
    KNOWN_GROUPS_KEY: 'cbtis_known_group_databases',

    // Sanitizar el nombre del grupo para crear la DB física
    sanitizeGroupName(groupName) {
        if (!groupName) return '';
        return groupName.trim().toUpperCase().replace(/[\/\\?%*:|"<>.]/g, '').replace(/\s+/g, '_');
    },

    // Obtener el nombre de la DB física
    getDbName(groupName) {
        const safe = this.sanitizeGroupName(groupName);
        return `${this.DB_PREFIX}${safe}`;
    },

    // Obtener la lista de grupos conocidos con base de datos
    getKnownGroups() {
        try {
            const raw = localStorage.getItem(this.KNOWN_GROUPS_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.error('Error al obtener lista de grupos:', e);
            return [];
        }
    },

    // Registrar un grupo en el catálogo de grupos
    registerGroup(groupName) {
        const trimmed = groupName.trim().toUpperCase();
        if (!trimmed) return;
        const groups = this.getKnownGroups();
        if (!groups.includes(trimmed)) {
            groups.push(trimmed);
            groups.sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
            localStorage.setItem(this.KNOWN_GROUPS_KEY, JSON.stringify(groups));
        }
    },

    // Abrir o crear la base de datos independiente para un grupo determinado
    openGroupDB(groupName) {
        return new Promise((resolve, reject) => {
            const safeName = this.sanitizeGroupName(groupName);
            if (!safeName) {
                return reject(new Error('Nombre de grupo inválido.'));
            }

            const dbName = this.getDbName(groupName);
            const request = indexedDB.open(dbName, 1);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
                    store.createIndex('by_paternal', 'paternalLastName', { unique: false });
                    store.createIndex('by_email', 'email', { unique: false });
                }
            };

            request.onsuccess = (e) => {
                this.registerGroup(groupName);
                resolve(e.target.result);
            };

            request.onerror = (e) => {
                console.error(`Error al abrir IndexedDB para el grupo ${groupName}:`, e.target.error);
                reject(e.target.error);
            };
        });
    },

    // Cargar todos los alumnos de un grupo desde su DB independiente
    getStudents(groupName) {
        return new Promise(async (resolve, reject) => {
            try {
                const db = await this.openGroupDB(groupName);
                const tx = db.transaction(this.STORE_NAME, 'readonly');
                const store = tx.objectStore(this.STORE_NAME);
                const request = store.getAll();

                request.onsuccess = () => {
                    db.close();
                    resolve(request.result || []);
                };
                request.onerror = (e) => {
                    db.close();
                    reject(e.target.error);
                };
            } catch (err) {
                reject(err);
            }
        });
    },

    // Guardar o actualizar un alumno en la DB del grupo correspondiente
    saveStudent(groupName, student) {
        return new Promise(async (resolve, reject) => {
            try {
                const db = await this.openGroupDB(groupName);
                const tx = db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                const request = store.put(student);

                request.onsuccess = () => {
                    db.close();
                    resolve(true);
                };
                request.onerror = (e) => {
                    db.close();
                    reject(e.target.error);
                };
            } catch (err) {
                reject(err);
            }
        });
    },

    // Eliminar un alumno de la DB del grupo
    deleteStudent(groupName, studentId) {
        return new Promise(async (resolve, reject) => {
            try {
                const db = await this.openGroupDB(groupName);
                const tx = db.transaction(this.STORE_NAME, 'readwrite');
                const store = tx.objectStore(this.STORE_NAME);
                const request = store.delete(studentId);

                request.onsuccess = () => {
                    db.close();
                    resolve(true);
                };
                request.onerror = (e) => {
                    db.close();
                    reject(e.target.error);
                };
            } catch (err) {
                reject(err);
            }
        });
    },

    // Eliminar completamente la base de datos física de un grupo
    deleteGroupDB(groupName) {
        return new Promise((resolve, reject) => {
            const dbName = this.getDbName(groupName);
            const req = indexedDB.deleteDatabase(dbName);

            req.onsuccess = () => {
                const trimmed = groupName.trim().toUpperCase();
                let groups = this.getKnownGroups();
                groups = groups.filter(g => g !== trimmed);
                localStorage.setItem(this.KNOWN_GROUPS_KEY, JSON.stringify(groups));
                resolve(true);
            };

            req.onerror = (e) => {
                console.error(`Error al eliminar la BD del grupo ${groupName}:`, e.target.error);
                reject(e.target.error);
            };
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO DE LA APLICACIÓN ---
    let students = [];
    let currentFilter = '';
    let studentToEditId = null;
    let studentToDeleteId = null;

    // --- ESTADO DE ASISTENCIA ---
    let attendanceStudents = [];
    let attendanceHistory = {};
    let attendanceFilter = '';

    // --- ELEMENTOS DEL DOM ---
    // Formulario de Registro
    const registrationForm = document.getElementById('registration-form');
    const groupInput = document.getElementById('group-input');
    const paternalInput = document.getElementById('paternal-last-name');
    const maternalInput = document.getElementById('maternal-last-name');
    const firstNameInput = document.getElementById('first-name');
    const emailInput = document.getElementById('email-input');
    const submitBtn = document.getElementById('btn-submit');

    // Tabla y Gestor de Base de Datos de Grupo
    const studentsTable = document.getElementById('students-table');
    const studentsTableBody = document.getElementById('students-table-body');
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search');
    const groupDbSelect = document.getElementById('group-db-select');
    const btnDownloadList = document.getElementById('btn-download-list');

    // Vistas Vacías
    const emptyStateView = document.getElementById('empty-state-view');
    const noResultsView = document.getElementById('no-results-view');

    // Estadísticas e Info
    const totalCountSpan = document.getElementById('total-count');
    const currentDateSpan = document.getElementById('current-date');

    // Elementos de Pestañas y Vistas
    const tabButtons = document.querySelectorAll('.tab-btn');
    const viewRegistro = document.getElementById('view-registro');
    const viewAsistencia = document.getElementById('view-asistencia');
    const viewEscaneo = document.getElementById('view-escaneo');
    
    const attDateInput = document.getElementById('attendance-date');
    const btnImportFromRegistry = document.getElementById('btn-import-from-registry');
    const attGroupDbSelect = document.getElementById('att-group-db-select');
    const btnExportHistory = document.getElementById('btn-export-history');
    const btnImportHistoryTrigger = document.getElementById('btn-import-history-trigger');
    const importHistoryFile = document.getElementById('import-history-file');
    
    const attSearchInput = document.getElementById('attendance-search-input');
    const attClearSearchBtn = document.getElementById('attendance-clear-search');
    const attTable = document.getElementById('attendance-table');
    const attTableBody = document.getElementById('attendance-table-body');
    const attEmptyState = document.getElementById('attendance-empty-state-view');
    const attNoResults = document.getElementById('attendance-no-results-view');
    
    const attStatTotal = document.getElementById('att-stat-total');
    const attStatPresent = document.getElementById('att-stat-present');
    const attStatAbsent = document.getElementById('att-stat-absent');
    const attStatPercent = document.getElementById('att-stat-percent');

    // Elementos del Escáner QR
    const btnStartCamera = document.getElementById('btn-start-camera');
    const btnStopCamera = document.getElementById('btn-stop-camera');
    const qrInputFile = document.getElementById('qr-input-file');
    const qrScanEmptyState = document.getElementById('qr-scan-empty-state');
    const qrScanResultCard = document.getElementById('qr-scan-result-card');

    let html5QrCode = null;
    let isScannerRunning = false;

    // Contenedores Toast
    const toastContainer = document.getElementById('toast-container');

    // Modales Personalizados
    const editModal = document.getElementById('custom-modal');
    const editModalBody = document.getElementById('modal-body-content');
    const editModalCloseBtn = document.getElementById('modal-close-btn');
    const editModalCancelBtn = document.getElementById('modal-cancel-btn');
    const editModalConfirmBtn = document.getElementById('modal-confirm-btn');

    const deleteModal = document.getElementById('confirm-delete-modal');
    const deleteStudentNameSpan = document.getElementById('delete-student-name');
    const deleteModalCloseBtn = document.getElementById('delete-modal-close-btn');
    const deleteModalCancelBtn = document.getElementById('delete-modal-cancel-btn');
    const deleteModalConfirmBtn = document.getElementById('delete-modal-confirm-btn');

    // Botón Limpiar y su Modal
    const btnClearTable = document.getElementById('btn-clear-table');
    const confirmClearModal = document.getElementById('confirm-clear-modal');
    const clearModalCloseBtn = document.getElementById('clear-modal-close-btn');
    const clearModalCancelBtn = document.getElementById('clear-modal-cancel-btn');
    const clearModalConfirmBtn = document.getElementById('clear-modal-confirm-btn');

    // Modal de Código QR
    let currentQRStudent = null;
    const qrModal = document.getElementById('qr-modal');
    const qrStudentName = document.getElementById('qr-student-name');
    const qrStudentGroup = document.getElementById('qr-student-group');
    const qrStudentEmail = document.getElementById('qr-student-email');
    const qrCodeContainer = document.getElementById('qr-code-container');
    const qrModalCloseBtn = document.getElementById('qr-modal-close-btn');
    const qrModalDownloadBtn = document.getElementById('qr-modal-download-btn');
    const qrModalPrintBtn = document.getElementById('qr-modal-print-btn');


    // --- INICIALIZACIÓN ---
    async function init() {
        refreshGroupSelects();

        const savedGroup = localStorage.getItem('cbtis_active_group');
        if (savedGroup) {
            groupInput.value = savedGroup;
            await loadGroupFromDB(savedGroup);
        } else {
            const knownGroups = GroupDBManager.getKnownGroups();
            if (knownGroups.length > 0) {
                groupInput.value = knownGroups[0];
                await loadGroupFromDB(knownGroups[0]);
            } else {
                students = [];
                render();
            }
        }

        // Cargar asistencia desde LocalStorage
        const savedAttStudents = localStorage.getItem('cbtis_attendance_students');
        if (savedAttStudents) {
            try {
                attendanceStudents = JSON.parse(savedAttStudents);
            } catch (e) {
                console.error("Error al cargar alumnos de asistencia:", e);
                attendanceStudents = [];
            }
        }

        const savedAttHistory = localStorage.getItem('cbtis_attendance_history');
        if (savedAttHistory) {
            try {
                attendanceHistory = JSON.parse(savedAttHistory);
            } catch (e) {
                console.error("Error al cargar historial de asistencia:", e);
                attendanceHistory = {};
            }
        }

        // Fecha de asistencia por defecto a hoy (local)
        const localToday = new Date();
        const year = localToday.getFullYear();
        const month = String(localToday.getMonth() + 1).padStart(2, '0');
        const day = String(localToday.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        if (attDateInput) {
            attDateInput.value = todayStr;
        }

        setCurrentDate();
        setupEventListeners();

        render();
        renderAttendance();

        const currentActiveGroup = groupInput.value.trim();
        showToast(
            '¡Bienvenido!', 
            currentActiveGroup 
                ? `Base de datos cargada (${currentActiveGroup}). ${students.length} alumnos.`
                : 'Sistema listo para registrar y gestionar bases de datos por grupo.', 
            'info'
        );
    }

    // --- MANEJO DE SELECCIÓN Y CARGA DE BD POR GRUPO ---
    async function loadGroupFromDB(groupName) {
        const trimmed = groupName.trim().toUpperCase();
        if (!trimmed) {
            students = [];
            render();
            return;
        }

        try {
            const loaded = await GroupDBManager.getStudents(trimmed);
            students = loaded || [];
            sortStudents();
            
            localStorage.setItem('cbtis_active_group', trimmed);
            if (groupInput.value !== trimmed) {
                groupInput.value = trimmed;
            }
            if (groupDbSelect) {
                groupDbSelect.value = trimmed;
            }
            render();
        } catch (err) {
            console.error(`Error al cargar la base de datos del grupo ${trimmed}:`, err);
            showToast('Error de Base de Datos', `No se pudo abrir la BD del grupo ${trimmed}.`, 'danger');
        }
    }

    function refreshGroupSelects() {
        const groups = GroupDBManager.getKnownGroups();
        const currentActive = groupInput ? groupInput.value.trim().toUpperCase() : '';

        if (groupDbSelect) {
            groupDbSelect.innerHTML = '<option value="">-- Cargar Base de Datos de Grupo --</option>';
            groups.forEach(grp => {
                const opt = document.createElement('option');
                opt.value = grp;
                opt.textContent = `Grupo ${grp}`;
                if (grp === currentActive) opt.selected = true;
                groupDbSelect.appendChild(opt);
            });
        }

        if (attGroupDbSelect) {
            attGroupDbSelect.innerHTML = '<option value="">-- Cargar de otra BD de Grupo --</option>';
            groups.forEach(grp => {
                const opt = document.createElement('option');
                opt.value = grp;
                opt.textContent = `Grupo ${grp}`;
                attGroupDbSelect.appendChild(opt);
            });
        }
    }

    // --- MANEJO DE FECHA ---
    function setCurrentDate() {
        const today = new Date();
        const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
        currentDateSpan.textContent = today.toLocaleDateString('es-MX', options);
    }


    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        // Registro de Alumnos
        registrationForm.addEventListener('submit', handleRegistrationSubmit);

        // Validación en tiempo real al escribir o perder el foco
        [paternalInput, maternalInput, firstNameInput, emailInput].forEach(input => {
            input.addEventListener('input', () => validateField(input));
            input.addEventListener('blur', () => validateField(input));
        });

        groupInput.addEventListener('input', () => {
            validateField(groupInput);
        });

        groupInput.addEventListener('blur', async () => {
            validateField(groupInput);
            const capitalized = groupInput.value.toUpperCase().trim();
            if (capitalized && capitalized !== localStorage.getItem('cbtis_active_group')) {
                groupInput.value = capitalized;
                await loadGroupFromDB(capitalized);
            }
        });

        // Selector de Base de Datos de Grupo
        if (groupDbSelect) {
            groupDbSelect.addEventListener('change', async (e) => {
                const selectedGroup = e.target.value;
                if (selectedGroup) {
                    await loadGroupFromDB(selectedGroup);
                    showToast('Base de Datos Cargada', `Se cargó el grupo ${selectedGroup} desde IndexedDB.`, 'success');
                }
            });
        }

        // Botón Descargar Lista
        if (btnDownloadList) {
            btnDownloadList.addEventListener('click', downloadGroupList);
        }

        // Barra de Búsqueda
        searchInput.addEventListener('input', handleSearch);
        clearSearchBtn.addEventListener('click', handleClearSearch);

        // Control del Modal de Edición
        editModalCloseBtn.addEventListener('click', closeEditModal);
        editModalCancelBtn.addEventListener('click', closeEditModal);
        editModalConfirmBtn.addEventListener('click', saveStudentEdit);

        // Control del Modal de Eliminación
        deleteModalCloseBtn.addEventListener('click', closeDeleteModal);
        deleteModalCancelBtn.addEventListener('click', closeDeleteModal);
        deleteModalConfirmBtn.addEventListener('click', confirmDelete);

        // Control del Modal de Limpieza
        btnClearTable.addEventListener('click', openClearModal);
        clearModalCloseBtn.addEventListener('click', closeClearModal);
        clearModalCancelBtn.addEventListener('click', closeClearModal);
        clearModalConfirmBtn.addEventListener('click', confirmClearTable);

        // Control del Modal de QR
        if (qrModalCloseBtn) qrModalCloseBtn.addEventListener('click', closeQRCodeModal);
        if (qrModalDownloadBtn) qrModalDownloadBtn.addEventListener('click', downloadQRCode);
        if (qrModalPrintBtn) qrModalPrintBtn.addEventListener('click', printQRCode);

        // Escáner QR Controles
        if (btnStartCamera) btnStartCamera.addEventListener('click', startCameraScanner);
        if (btnStopCamera) btnStopCamera.addEventListener('click', stopCameraScanner);
        if (qrInputFile) qrInputFile.addEventListener('change', handleQrFileUpload);

        // Cerrar modales al hacer clic fuera del card
        window.addEventListener('click', (e) => {
            if (e.target === editModal) closeEditModal();
            if (e.target === deleteModal) closeDeleteModal();
            if (e.target === confirmClearModal) closeClearModal();
            if (e.target === qrModal) closeQRCodeModal();
        });

        // --- EVENT LISTENERS DE ASISTENCIA Y PESTAÑAS ---
        setupTabs();

        btnImportFromRegistry.addEventListener('click', importFromRegistry);
        if (attGroupDbSelect) attGroupDbSelect.addEventListener('change', handleAttGroupSelect);

        btnExportHistory.addEventListener('click', exportAttendanceHistory);
        btnImportHistoryTrigger.addEventListener('click', () => importHistoryFile.click());
        importHistoryFile.addEventListener('change', handleImportHistory);

        attSearchInput.addEventListener('input', handleAttendanceSearch);
        attClearSearchBtn.addEventListener('click', handleAttendanceClearSearch);
        attDateInput.addEventListener('change', () => renderAttendance());
    }


    // --- DESCARGA DE LISTA DE ALUMNOS ---
    function downloadGroupList() {
        if (students.length === 0) {
            showToast('Descarga Fallida', 'No hay alumnos registrados para descargar.', 'warning');
            return;
        }

        const rawGroup = groupInput.value.trim();
        if (rawGroup === '') {
            showToast('Grupo Requerido', 'Especifica el grupo en el formulario para nombrar el archivo.', 'warning');
            validateField(groupInput);
            groupInput.focus();
            return;
        }

        const safeGroup = rawGroup.replace(/[\/\\?%*:|"<>.]/g, '').replace(/\s+/g, '_');

        let csvContent = `Grupo Escolar: ${rawGroup}\nNº,ID Alumno,Apellido Paterno,Apellido Materno,Nombre(s),Correo Electrónico\n`;

        students.forEach((student, index) => {
            const num = index + 1;
            const studentId = escapeCSVField(student.id || '');
            const paternal = escapeCSVField(student.paternalLastName);
            const maternal = escapeCSVField(student.maternalLastName);
            const name = escapeCSVField(student.firstName);
            const email = escapeCSVField(student.email || '');

            csvContent += `${num},${studentId},${paternal},${maternal},${name},${email}\n`;
        });

        // Marca de orden de bytes UTF-8 (BOM) para compatibilidad con Excel
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');

        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0];

            link.setAttribute('href', url);
            link.setAttribute('download', `lista_alumnos_${safeGroup}_${dateStr}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            showToast(
                'Lista Descargada', 
                `Se ha descargado la lista del grupo ${rawGroup} con ${students.length} alumnos.`, 
                'success'
            );
        } else {
            showToast('Error', 'Tu navegador no soporta la descarga directa de archivos.', 'danger');
        }
    }

    function escapeCSVField(val) {
        let stringVal = val ? val.toString() : '';
        if (stringVal.includes('"')) {
            stringVal = stringVal.replace(/"/g, '""');
        }
        if (stringVal.includes(',') || stringVal.includes('"') || stringVal.includes('\n')) {
            stringVal = `"${stringVal}"`;
        }
        return stringVal;
    }


    // --- VALIDACIONES DE FORMULARIO ---
    function validateField(input) {
        if (!input) return false;
        const parent = input.parentElement;
        const value = input.value.trim();
        const errorSpan = parent ? parent.querySelector('.error-message') : null;

        if (value === '') {
            if (parent) {
                parent.classList.remove('success');
                parent.classList.add('error');
            }
            if (errorSpan) {
                errorSpan.textContent = 'Este campo es requerido.';
            }
            return false;
        }

        if (input.type === 'email' || input.id === 'email-input' || input.id === 'edit-email') {
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(value)) {
                if (parent) {
                    parent.classList.remove('success');
                    parent.classList.add('error');
                }
                if (errorSpan) {
                    errorSpan.textContent = 'Introduce un formato de correo válido.';
                }
                return false;
            }
        }

        if (parent) {
            parent.classList.remove('error');
            parent.classList.add('success');
        }
        return true;
    }

    function validateForm() {
        const isGroupValid = validateField(groupInput);
        const isPaternalValid = validateField(paternalInput);
        const isMaternalValid = validateField(maternalInput);
        const isNameValid = validateField(firstNameInput);
        const isEmailValid = validateField(emailInput);

        return isGroupValid && isPaternalValid && isMaternalValid && isNameValid && isEmailValid;
    }

    function clearFormValidationStyles() {
        [paternalInput, maternalInput, firstNameInput, emailInput].forEach(input => {
            if (input && input.parentElement) {
                input.parentElement.classList.remove('success', 'error');
            }
        });
    }


    // --- OPERACIONES CRUD SOBRE INDEXEDDB ---

    // 1. Crear Alumno y Guardar en la BD del Grupo
    async function handleRegistrationSubmit(e) {
        e.preventDefault();

        if (!validateForm()) {
            showToast('Formulario Incompleto', 'Por favor, llena todos los campos obligatorios.', 'warning');
            return;
        }

        const group = groupInput.value.toUpperCase().trim();
        const paternal = capitalizeText(paternalInput.value);
        const maternal = capitalizeText(maternalInput.value);
        const firstName = capitalizeText(firstNameInput.value);
        const email = emailInput.value.trim().toLowerCase();

        // Verificar duplicados en el grupo activo
        const isDuplicate = students.some(student => 
            student.firstName.toLowerCase().trim() === firstName.toLowerCase().trim() &&
            student.paternalLastName.toLowerCase().trim() === paternal.toLowerCase().trim() &&
            student.maternalLastName.toLowerCase().trim() === maternal.toLowerCase().trim()
        );

        if (isDuplicate) {
            showToast(
                'Registro Duplicado', 
                `El alumno "${firstName} ${paternal} ${maternal}" ya se encuentra registrado en el grupo ${group}.`, 
                'warning'
            );
            return;
        }

        const uniqueId = `ALU-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;

        const newStudent = {
            id: uniqueId,
            group: group,
            paternalLastName: paternal,
            maternalLastName: maternal,
            firstName: firstName,
            email: email
        };

        try {
            await GroupDBManager.saveStudent(group, newStudent);

            students.push(newStudent);
            sortStudents();
            refreshGroupSelects();
            render(newStudent.id);

            // Limpiar datos del alumno
            paternalInput.value = '';
            maternalInput.value = '';
            firstNameInput.value = '';
            emailInput.value = '';
            clearFormValidationStyles();

            showToast(
                'Guardado en Base de Datos', 
                `${firstName} ${paternal} ha sido guardado en la BD del grupo ${group}.`, 
                'success'
            );

            showQRCodeModal(newStudent);
        } catch (err) {
            console.error("Error al guardar alumno en IndexedDB:", err);
            showToast('Error al Guardar', 'No se pudo guardar el registro en la base de datos del grupo.', 'danger');
        }
    }


    // --- SISTEMA DE RENDERIZADO Y VISTAS ---
    function render(highlightId = null) {
        const filteredStudents = students.filter(student => {
            const query = currentFilter.toLowerCase().trim();
            if (query === '') return true;

            const fullName = `${student.firstName} ${student.paternalLastName} ${student.maternalLastName}`.toLowerCase();
            const alternateFullName = `${student.paternalLastName} ${student.maternalLastName} ${student.firstName}`.toLowerCase();
            const email = (student.email || '').toLowerCase();

            return fullName.includes(query) || alternateFullName.includes(query) || email.includes(query);
        });

        if (students.length === 0) {
            emptyStateView.style.display = 'flex';
            noResultsView.style.display = 'none';
            studentsTable.style.display = 'none';
            if (btnDownloadList) btnDownloadList.disabled = true;
        } else if (filteredStudents.length === 0) {
            emptyStateView.style.display = 'none';
            noResultsView.style.display = 'flex';
            studentsTable.style.display = 'none';
            if (btnDownloadList) btnDownloadList.disabled = true;
        } else {
            emptyStateView.style.display = 'none';
            noResultsView.style.display = 'none';
            studentsTable.style.display = 'table';
            if (btnDownloadList) btnDownloadList.disabled = false;
        }

        studentsTableBody.innerHTML = '';
        
        filteredStudents.forEach((student, index) => {
            const row = document.createElement('tr');
            row.id = `row-${student.id}`;

            if (highlightId && student.id === highlightId) {
                row.classList.add('row-new');
            }

            row.innerHTML = `
                <td class="col-num">${index + 1}</td>
                <td>${escapeHTML(student.paternalLastName)}</td>
                <td>${escapeHTML(student.maternalLastName)}</td>
                <td>${escapeHTML(student.firstName)}</td>
                <td>${escapeHTML(student.email || '-')}</td>
                <td class="col-actions">
                    <div class="action-buttons">
                        <button 
                            class="btn-action btn-qr-row" 
                            data-id="${student.id}" 
                            title="Ver Código QR"
                            aria-label="Ver QR de ${escapeHTML(student.firstName)}"
                        >
                            <i class="fa-solid fa-qrcode"></i>
                        </button>
                        <button 
                            class="btn-action btn-edit-row" 
                            data-id="${student.id}" 
                            title="Editar Alumno"
                            aria-label="Editar ${escapeHTML(student.firstName)}"
                        >
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button 
                            class="btn-action btn-delete-row" 
                            data-id="${student.id}" 
                            title="Eliminar Alumno"
                            aria-label="Eliminar ${escapeHTML(student.firstName)}"
                        >
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;

            studentsTableBody.appendChild(row);
        });

        document.querySelectorAll('.btn-qr-row').forEach(btn => {
            btn.addEventListener('click', () => {
                const studentId = btn.getAttribute('data-id');
                const targetStudent = students.find(s => s.id === studentId);
                if (targetStudent) {
                    showQRCodeModal(targetStudent);
                }
            });
        });

        document.querySelectorAll('.btn-edit-row').forEach(btn => {
            btn.addEventListener('click', () => openEditModal(btn.getAttribute('data-id')));
        });

        document.querySelectorAll('.btn-delete-row').forEach(btn => {
            btn.addEventListener('click', () => openDeleteModal(btn.getAttribute('data-id')));
        });

        totalCountSpan.textContent = students.length;
    }


    // --- MANEJO DE BÚSQUEDA ---
    function handleSearch(e) {
        currentFilter = e.target.value;
        if (currentFilter.length > 0) {
            clearSearchBtn.style.display = 'flex';
        } else {
            clearSearchBtn.style.display = 'none';
        }
        render();
    }

    function handleClearSearch() {
        searchInput.value = '';
        currentFilter = '';
        clearSearchBtn.style.display = 'none';
        searchInput.focus();
        render();
    }


    // --- MODAL DE EDICIÓN ---
    function openEditModal(id) {
        const student = students.find(s => s.id === id);
        if (!student) return;

        studentToEditId = id;

        editModalBody.innerHTML = `
            <div class="form-modal-edit" style="display: flex; flex-direction: column; gap: 1.2rem;">
                <div class="input-group">
                    <label for="edit-paternal">
                        <i class="fa-solid fa-signature input-icon"></i> Apellido Paterno
                    </label>
                    <input type="text" id="edit-paternal" value="${escapeHTML(student.paternalLastName)}" required>
                    <span class="error-message">Este campo es requerido.</span>
                </div>
                <div class="input-group">
                    <label for="edit-maternal">
                        <i class="fa-solid fa-signature input-icon"></i> Apellido Materno
                    </label>
                    <input type="text" id="edit-maternal" value="${escapeHTML(student.maternalLastName)}" required>
                    <span class="error-message">Este campo es requerido.</span>
                </div>
                <div class="input-group">
                    <label for="edit-first-name">
                        <i class="fa-solid fa-user input-icon"></i> Nombre(s)
                    </label>
                    <input type="text" id="edit-first-name" value="${escapeHTML(student.firstName)}" required>
                    <span class="error-message">Este campo es requerido.</span>
                </div>
                <div class="input-group">
                    <label for="edit-email">
                        <i class="fa-solid fa-envelope input-icon"></i> Correo Electrónico
                    </label>
                    <input type="email" id="edit-email" value="${escapeHTML(student.email || '')}" required>
                    <span class="error-message">Este campo es requerido.</span>
                </div>
            </div>
        `;

        const editPaternal = document.getElementById('edit-paternal');
        const editMaternal = document.getElementById('edit-maternal');
        const editFirstName = document.getElementById('edit-first-name');
        const editEmail = document.getElementById('edit-email');

        [editPaternal, editMaternal, editFirstName, editEmail].forEach(input => {
            if (input) input.addEventListener('input', () => validateField(input));
        });

        editModal.classList.add('active');
        editModal.setAttribute('aria-hidden', 'false');
        if (editPaternal) editPaternal.focus();
    }

    function closeEditModal() {
        editModal.classList.remove('active');
        editModal.setAttribute('aria-hidden', 'true');
        studentToEditId = null;
    }

    async function saveStudentEdit() {
        if (!studentToEditId) return;

        const editPaternal = document.getElementById('edit-paternal');
        const editMaternal = document.getElementById('edit-maternal');
        const editFirstName = document.getElementById('edit-first-name');
        const editEmail = document.getElementById('edit-email');

        const isPaternalValid = validateField(editPaternal);
        const isMaternalValid = validateField(editMaternal);
        const isNameValid = validateField(editFirstName);
        const isEmailValid = validateField(editEmail);

        if (!isPaternalValid || !isMaternalValid || !isNameValid || !isEmailValid) {
            showToast('Formulario Incompleto', 'Por favor, llena todos los campos en la edición.', 'warning');
            return;
        }

        const index = students.findIndex(s => s.id === studentToEditId);
        if (index !== -1) {
            const formattedPaternal = capitalizeText(editPaternal.value);
            const formattedMaternal = capitalizeText(editMaternal.value);
            const formattedName = capitalizeText(editFirstName.value);
            const formattedEmail = editEmail.value.trim().toLowerCase();
            const currentGroup = groupInput.value.toUpperCase().trim();

            const isDuplicate = students.some(student => 
                student.id !== studentToEditId &&
                student.firstName.toLowerCase().trim() === formattedName.toLowerCase().trim() &&
                student.paternalLastName.toLowerCase().trim() === formattedPaternal.toLowerCase().trim() &&
                student.maternalLastName.toLowerCase().trim() === formattedMaternal.toLowerCase().trim()
            );

            if (isDuplicate) {
                showToast(
                    'Registro Duplicado', 
                    `El alumno "${formattedName} ${formattedPaternal} ${formattedMaternal}" ya se encuentra registrado.`, 
                    'warning'
                );
                return;
            }

            const updatedStudent = {
                ...students[index],
                paternalLastName: formattedPaternal,
                maternalLastName: formattedMaternal,
                firstName: formattedName,
                email: formattedEmail
            };

            try {
                await GroupDBManager.saveStudent(currentGroup, updatedStudent);
                students[index] = updatedStudent;
                sortStudents();
                render();
                closeEditModal();

                showToast(
                    'Base de Datos Actualizada', 
                    `Se guardaron los cambios para ${formattedName} ${formattedPaternal} en la BD de ${currentGroup}.`, 
                    'success'
                );
            } catch (err) {
                console.error("Error al actualizar alumno en IndexedDB:", err);
                showToast('Error', 'No se pudieron guardar los cambios en la base de datos.', 'danger');
            }
        }
    }


    // --- MODAL DE ELIMINACIÓN DE ALUMNO ---
    function openDeleteModal(id) {
        const student = students.find(s => s.id === id);
        if (!student) return;

        studentToDeleteId = id;
        deleteStudentNameSpan.textContent = `${student.firstName} ${student.paternalLastName} ${student.maternalLastName}`;

        deleteModal.classList.add('active');
        deleteModal.setAttribute('aria-hidden', 'false');
    }

    function closeDeleteModal() {
        deleteModal.classList.remove('active');
        deleteModal.setAttribute('aria-hidden', 'true');
        studentToDeleteId = null;
    }

    function confirmDelete() {
        if (!studentToDeleteId) return;

        const targetId = studentToDeleteId;
        const student = students.find(s => s.id === targetId);
        const studentName = student ? `${student.firstName} ${student.paternalLastName}` : 'El alumno';
        const row = document.getElementById(`row-${targetId}`);
        
        closeDeleteModal();

        if (row) {
            row.classList.add('row-delete');
            setTimeout(() => {
                executeDeletion(targetId, studentName);
            }, 300);
        } else {
            executeDeletion(targetId, studentName);
        }
    }

    async function executeDeletion(id, name) {
        const currentGroup = groupInput.value.toUpperCase().trim();
        try {
            await GroupDBManager.deleteStudent(currentGroup, id);
            students = students.filter(s => s.id !== id);
            render();

            showToast(
                'Alumno Eliminado', 
                `${name} ha sido eliminado de la base de datos del grupo ${currentGroup}.`, 
                'danger'
            );
        } catch (err) {
            console.error("Error al eliminar alumno de IndexedDB:", err);
            showToast('Error', 'No se pudo eliminar el alumno de la base de datos.', 'danger');
        }
    }

    // --- MODAL DE LIMPIEZA DE VISTA ---
    function openClearModal() {
        if (students.length === 0 && !groupInput.value) {
            showToast('Vista ya Limpia', 'No hay grupo cargado en pantalla.', 'info');
            return;
        }
        confirmClearModal.classList.add('active');
        confirmClearModal.setAttribute('aria-hidden', 'false');
    }

    function closeClearModal() {
        confirmClearModal.classList.remove('active');
        confirmClearModal.setAttribute('aria-hidden', 'true');
    }

    function confirmClearTable() {
        closeClearModal();
        const rows = document.querySelectorAll('#students-table-body tr');
        if (rows.length > 0) {
            rows.forEach(row => row.classList.add('row-delete'));
            setTimeout(() => executeClearTable(), 300);
        } else {
            executeClearTable();
        }
    }

    function executeClearTable() {
        students = [];
        groupInput.value = '';
        if (groupDbSelect) groupDbSelect.value = '';
        localStorage.removeItem('cbtis_active_group');
        
        registrationForm.reset();
        clearFormValidationStyles();
        render();
        showToast('Vista Limpiada', 'Puedes ingresar un nuevo grupo o seleccionar uno existente.', 'info');
    }


    // --- MODAL DE CÓDIGO QR ---
    function showQRCodeModal(student) {
        if (!student || !qrModal || !qrCodeContainer) return;
        currentQRStudent = student;

        qrStudentName.textContent = `${student.firstName} ${student.paternalLastName} ${student.maternalLastName}`;
        qrStudentGroup.innerHTML = `<i class="fa-solid fa-users-rectangle"></i> Grupo: ${escapeHTML(student.group)}`;
        qrStudentEmail.innerHTML = `<i class="fa-solid fa-envelope"></i> Correo: ${escapeHTML(student.email || '-')}`;

        qrCodeContainer.innerHTML = '';

        const qrData = JSON.stringify({
            id: student.id,
            nombre: `${student.firstName} ${student.paternalLastName} ${student.maternalLastName}`,
            grupo: student.group,
            email: student.email
        });

        if (typeof QRCode !== 'undefined') {
            new QRCode(qrCodeContainer, {
                text: qrData,
                width: 180,
                height: 180,
                colorDark: "#0f172a",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
            qrModal.classList.add('active');
            qrModal.setAttribute('aria-hidden', 'false');
        }
    }

    function closeQRCodeModal() {
        if (qrModal) {
            qrModal.classList.remove('active');
            qrModal.setAttribute('aria-hidden', 'true');
        }
        currentQRStudent = null;
    }

    function downloadQRCode() {
        if (!currentQRStudent || !qrCodeContainer) return;

        const qrCanvas = qrCodeContainer.querySelector('canvas');
        const qrImg = qrCodeContainer.querySelector('img');

        let imageSrc = '';
        if (qrCanvas) {
            imageSrc = qrCanvas.toDataURL('image/png');
        } else if (qrImg) {
            imageSrc = qrImg.src;
        }

        if (!imageSrc) {
            showToast('Error', 'No se pudo generar la imagen del código QR.', 'danger');
            return;
        }

        const link = document.createElement('a');
        const fileName = `QR_${currentQRStudent.paternalLastName}_${currentQRStudent.firstName}_${currentQRStudent.group}.png`
            .replace(/\s+/g, '_');
        link.download = fileName;
        link.href = imageSrc;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('QR Descargado', `Se ha guardado la imagen QR de ${currentQRStudent.firstName}.`, 'success');
    }

    function printQRCode() {
        window.print();
    }


    // --- LÓGICA Y FUNCIONES DEL ESCÁNER DE CÓDIGO QR ---

    async function startCameraScanner() {
        if (typeof Html5Qrcode === 'undefined') {
            showToast('Librería no Lista', 'La librería del lector QR aún se está cargando.', 'warning');
            return;
        }

        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("qr-reader");
        }

        try {
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            await html5QrCode.start(
                { facingMode: "environment" },
                config,
                onQrScanSuccess,
                onQrScanError
            );
            isScannerRunning = true;
            if (btnStartCamera) btnStartCamera.style.display = 'none';
            if (btnStopCamera) btnStopCamera.style.display = 'block';
            showToast('Cámara Activada', 'Escáner QR listo para leer códigos.', 'info');
        } catch (err) {
            console.error("Error al iniciar cámara para QR:", err);
            showToast('Error de Cámara', 'No se pudo acceder a la cámara. Revisa los permisos de tu dispositivo.', 'danger');
        }
    }

    async function stopCameraScanner() {
        if (html5QrCode && isScannerRunning) {
            try {
                await html5QrCode.stop();
                isScannerRunning = false;
                if (btnStartCamera) btnStartCamera.style.display = 'block';
                if (btnStopCamera) btnStopCamera.style.display = 'none';
            } catch (err) {
                console.error("Error al detener cámara:", err);
            }
        }
    }

    function onQrScanError(errorMessage) {
        // Silenciar errores continuos de búsqueda de frame sin QR
    }

    async function handleQrFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        if (typeof Html5Qrcode === 'undefined') {
            showToast('Librería no Lista', 'La librería del lector QR aún no está lista.', 'warning');
            return;
        }

        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("qr-reader");
        }

        try {
            const decodedText = await html5QrCode.scanFile(file, true);
            onQrScanSuccess(decodedText);
        } catch (err) {
            console.error("Error al decodificar imagen QR:", err);
            showToast('Lectura Fallida', 'No se detectó un código QR válido en la imagen seleccionada.', 'warning');
        }
        qrInputFile.value = '';
    }

    function onQrScanSuccess(decodedText) {
        if (!decodedText) return;

        const now = new Date();
        const timeStr = now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const resultTimeEl = document.getElementById('qr-result-time');
        if (resultTimeEl) {
            resultTimeEl.innerHTML = `<i class="fa-regular fa-clock"></i> Leído a las ${timeStr}`;
        }

        let parsed = null;
        try {
            parsed = JSON.parse(decodedText);
        } catch (e) {
            parsed = null;
        }

        if (qrScanEmptyState) qrScanEmptyState.style.display = 'none';
        if (qrScanResultCard) qrScanResultCard.style.display = 'block';

        const badge = document.getElementById('qr-result-badge');
        const resName = document.getElementById('qr-res-name');
        const resGroup = document.getElementById('qr-res-group');
        const resId = document.getElementById('qr-res-id');
        const resEmail = document.getElementById('qr-res-email');
        const resRaw = document.getElementById('qr-res-raw');

        if (parsed && (parsed.nombre || parsed.id)) {
            if (badge) {
                badge.className = 'result-badge success';
                badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Alumno CBTis Decodificado';
            }
            if (resName) resName.textContent = parsed.nombre || 'Nombre no especificado';
            if (resGroup) resGroup.innerHTML = `<i class="fa-solid fa-users-rectangle text-accent"></i> ${parsed.grupo || 'Sin grupo'}`;
            if (resId) resId.textContent = parsed.id || 'N/A';
            if (resEmail) resEmail.textContent = parsed.email || 'Sin correo';
            if (resRaw) resRaw.textContent = decodedText;

            showToast('QR Leído con Éxito', `Alumno: ${parsed.nombre || 'Desconocido'} (${parsed.grupo || ''})`, 'success');
        } else {
            if (badge) {
                badge.className = 'result-badge warning';
                badge.innerHTML = '<i class="fa-solid fa-circle-info"></i> Código QR Estándar / Texto';
            }
            if (resName) resName.textContent = 'Contenido QR de Texto / URL';
            if (resGroup) resGroup.innerHTML = `<i class="fa-solid fa-users-rectangle text-accent"></i> N/A`;
            if (resId) resId.textContent = 'N/A';
            if (resEmail) resEmail.textContent = 'N/A';
            if (resRaw) resRaw.textContent = decodedText;

            showToast('QR Decodificado', 'Se leyó el contenido del código QR.', 'info');
        }
    }


    // --- SISTEMA DE TOAST NOTIFICATIONS ---
    function showToast(title, message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let iconClass = 'fa-solid fa-circle-info';
        if (type === 'success') iconClass = 'fa-solid fa-circle-check';
        if (type === 'danger') iconClass = 'fa-solid fa-triangle-exclamation';
        if (type === 'warning') iconClass = 'fa-solid fa-circle-exclamation';

        toast.innerHTML = `
            <i class="${iconClass} toast-icon"></i>
            <div class="toast-content">
                <h4 class="toast-title">${escapeHTML(title)}</h4>
                <p class="toast-message">${escapeHTML(message)}</p>
            </div>
            <button class="toast-close" aria-label="Cerrar notificación">
                <i class="fa-solid fa-xmark"></i>
            </button>
            <div class="toast-progress"></div>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            dismissToast(toast);
        });

        toastContainer.appendChild(toast);

        setTimeout(() => {
            dismissToast(toast);
        }, 4000);
    }

    function dismissToast(toast) {
        if (!toast.parentNode) return;
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => {
            if (toast.parentNode) {
                toastContainer.removeChild(toast);
            }
        }, 300);
    }


    // --- AYUDANTES Y UTILIDADES ---

    function capitalizeText(str) {
        if (!str) return '';
        return str
            .trim()
            .split(/\s+/)
            .map(word => {
                if (word.length === 0) return '';
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            })
            .join(' ');
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function sortStudents() {
        students.sort((a, b) => {
            let cmp = a.paternalLastName.localeCompare(b.paternalLastName, 'es', { sensitivity: 'base' });
            if (cmp !== 0) return cmp;
            
            cmp = a.maternalLastName.localeCompare(b.maternalLastName, 'es', { sensitivity: 'base' });
            if (cmp !== 0) return cmp;
            
            return a.firstName.localeCompare(b.firstName, 'es', { sensitivity: 'base' });
        });
    }

    // --- FUNCIONES Y LÓGICA DE ASISTENCIA Y PESTAÑAS ---

    function setupTabs() {
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                tabButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const targetTab = btn.getAttribute('data-tab');

                viewRegistro.style.display = 'none';
                viewAsistencia.style.display = 'none';
                if (viewEscaneo) viewEscaneo.style.display = 'none';

                if (targetTab === 'registro') {
                    viewRegistro.style.display = 'grid';
                    stopCameraScanner();
                } else if (targetTab === 'asistencia') {
                    viewAsistencia.style.display = 'grid';
                    renderAttendance();
                    stopCameraScanner();
                } else if (targetTab === 'escaneo') {
                    if (viewEscaneo) viewEscaneo.style.display = 'grid';
                }
            });
        });
    }

    function importFromRegistry() {
        if (students.length === 0) {
            showToast('Lista Vacía', 'No hay alumnos en el grupo activo para cargar en asistencia.', 'warning');
            return;
        }

        attendanceStudents = students.map(student => ({
            id: student.id,
            name: `${student.paternalLastName} ${student.maternalLastName} ${student.firstName}`,
            email: student.email || ''
        }));

        attendanceStudents.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

        saveAttendanceToLocalStorage();
        renderAttendance();

        showToast('Alumnos Cargados', `Se cargaron ${attendanceStudents.length} alumnos del grupo actual.`, 'success');
    }

    async function handleAttGroupSelect(e) {
        const selectedGroup = e.target.value;
        if (!selectedGroup) return;

        try {
            const groupStudents = await GroupDBManager.getStudents(selectedGroup);
            if (groupStudents.length === 0) {
                showToast('Base de Datos Vacía', `El grupo ${selectedGroup} no tiene alumnos registrados.`, 'warning');
                return;
            }

            attendanceStudents = groupStudents.map(student => ({
                id: student.id,
                name: `${student.paternalLastName} ${student.maternalLastName} ${student.firstName}`,
                email: student.email || ''
            }));

            attendanceStudents.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));

            saveAttendanceToLocalStorage();
            renderAttendance();

            showToast('BD de Grupo Cargada', `Se cargaron ${attendanceStudents.length} alumnos del grupo ${selectedGroup}.`, 'success');
            attGroupDbSelect.value = '';
        } catch (err) {
            console.error("Error al cargar grupo para asistencia:", err);
            showToast('Error', `No se pudo abrir la BD del grupo ${selectedGroup}.`, 'danger');
        }
    }

    function renderAttendance() {
        const date = attDateInput.value;
        if (!date) return;

        const filtered = attendanceStudents.filter(student => {
            const query = attendanceFilter.toLowerCase().trim();
            if (query === '') return true;
            return student.name.toLowerCase().includes(query) || student.email.toLowerCase().includes(query);
        });

        if (attendanceStudents.length === 0) {
            attEmptyState.style.display = 'flex';
            attNoResults.style.display = 'none';
            attTable.style.display = 'none';
        } else if (filtered.length === 0) {
            attEmptyState.style.display = 'none';
            attNoResults.style.display = 'flex';
            attTable.style.display = 'none';
        } else {
            attEmptyState.style.display = 'none';
            attNoResults.style.display = 'none';
            attTable.style.display = 'table';
        }

        if (!attendanceHistory[date]) {
            attendanceHistory[date] = {};
        }
        const dayRecords = attendanceHistory[date];

        attTableBody.innerHTML = '';
        filtered.forEach((student, index) => {
            if (!dayRecords[student.id]) {
                dayRecords[student.id] = 'present';
            }
            const status = dayRecords[student.id];

            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="col-num">${index + 1}</td>
                <td><strong style="color: var(--text-primary); font-weight: 500;">${escapeHTML(student.name)}</strong></td>
                <td>
                    <div class="attendance-options" data-student-id="${student.id}">
                        <button class="att-btn att-present ${status === 'present' ? 'active' : ''}" data-status="present" aria-label="Presente">
                            <i class="fa-solid fa-check"></i> Pres
                        </button>
                        <button class="att-btn att-absent ${status === 'absent' ? 'active' : ''}" data-status="absent" aria-label="Ausente">
                            <i class="fa-solid fa-xmark"></i> Aus
                        </button>
                    </div>
                </td>
            `;
            attTableBody.appendChild(row);
        });

        document.querySelectorAll('.attendance-options').forEach(group => {
            const studentId = group.getAttribute('data-student-id');
            group.querySelectorAll('.att-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const status = btn.getAttribute('data-status');
                    
                    group.querySelectorAll('.att-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');

                    attendanceHistory[date][studentId] = status;
                    
                    saveAttendanceToLocalStorage();
                    updateAttendanceStats();
                });
            });
        });

        updateAttendanceStats();
    }

    function updateAttendanceStats() {
        const date = attDateInput.value;
        if (!date || attendanceStudents.length === 0) {
            attStatTotal.textContent = '0';
            attStatPresent.textContent = '0';
            attStatAbsent.textContent = '0';
            attStatPercent.textContent = '0%';
            return;
        }

        const dayRecords = attendanceHistory[date] || {};
        let total = attendanceStudents.length;
        let present = 0;
        let absent = 0;

        attendanceStudents.forEach(student => {
            const status = dayRecords[student.id] || 'present';
            if (status === 'present') present++;
            else if (status === 'absent') absent++;
            else if (status === 'late') present++;
        });

        attStatTotal.textContent = total;
        attStatPresent.textContent = present;
        attStatAbsent.textContent = absent;

        const percent = total > 0 ? Math.round((present / total) * 100) : 0;
        attStatPercent.textContent = `${percent}%`;
    }

    function saveAttendanceToLocalStorage() {
        localStorage.setItem('cbtis_attendance_students', JSON.stringify(attendanceStudents));
        localStorage.setItem('cbtis_attendance_history', JSON.stringify(attendanceHistory));
    }

    function handleAttendanceSearch(e) {
        attendanceFilter = e.target.value;
        if (attendanceFilter.length > 0) {
            attClearSearchBtn.style.display = 'flex';
        } else {
            attClearSearchBtn.style.display = 'none';
        }
        renderAttendance();
    }

    function handleAttendanceClearSearch() {
        attSearchInput.value = '';
        attendanceFilter = '';
        attClearSearchBtn.style.display = 'none';
        attSearchInput.focus();
        renderAttendance();
    }

    function exportAttendanceHistory() {
        if (attendanceStudents.length === 0) {
            showToast('Exportación Fallida', 'No hay datos de alumnos para exportar.', 'warning');
            return;
        }

        const backupData = {
            students: attendanceStudents,
            history: attendanceHistory
        };

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        
        link.setAttribute('href', url);
        link.setAttribute('download', `respaldo_asistencia_${dateStr}.json`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('Exportación Exitosa', 'El historial del semestre ha sido descargado en formato JSON.', 'success');
    }

    function handleImportHistory(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const data = JSON.parse(evt.target.result);
                if (!data.students || !data.history) {
                    showToast('Importación Fallida', 'El archivo no tiene el formato de respaldo correcto.', 'danger');
                    return;
                }

                attendanceStudents = data.students;
                attendanceHistory = data.history;

                saveAttendanceToLocalStorage();
                renderAttendance();

                showToast('Respaldo Restaurado', `Se importaron ${attendanceStudents.length} alumnos e historial con éxito.`, 'success');
            } catch (err) {
                showToast('Error', 'No se pudo procesar el archivo JSON de respaldo.', 'danger');
            }
            importHistoryFile.value = '';
        };
        reader.readAsText(file);
    }

    // --- EJECUTAR INICIO DE APP ---
    init();
});
