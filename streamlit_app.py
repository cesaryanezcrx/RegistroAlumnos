import streamlit as st
import pandas as pd

# Configuración básica de la página
st.set_page_config(page_title="Registro de Alumnos", page_icon="🎓")

st.title("🎓 Sistema de Registro de Alumnos")

# Inicializar la lista de alumnos en el estado de sesión
if "alumnos" not in st.session_state:
    st.session_state.alumnos = []

# Formulario de entrada
with st.form("form_registro", clear_on_submit=True):
    nombre = st.text_input("Nombre completo")
    matricula = st.text_input("Matrícula / ID")
    carrera = st.selectbox(
        "Carrera",
        ["Ingeniería en Sistemas", "Administración", "Medicina", "Derecho", "Otra"]
    )
    edad = st.number_input("Edad", min_value=15, max_value=100, step=1)
    
    enviado = st.form_submit_button("Registrar Alumno")

    if enviado:
        if nombre and matricula:
            st.session_state.alumnos.append({
                "Nombre": nombre,
                "Matrícula": matricula,
                "Carrera": carrera,
                "Edad": edad
            })
            st.success(f"Alumno {nombre} registrado con éxito.")
        else:
            st.error("Por favor completa los campos obligatorios (Nombre y Matrícula).")

# Mostrar lista de alumnos registrados
st.subheader("📋 Lista de Alumnos Registrados")

if st.session_state.alumnos:
    df_alumnos = pd.DataFrame(st.session_state.alumnos)
    st.dataframe(df_alumnos, use_container_width=True)
else:
    st.info("Aún no hay alumnos registrados.")
    import streamlit as st

st.title("Sistema de Registro de Alumnos")
st.write("Cargando aplicación...")