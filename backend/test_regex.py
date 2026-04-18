import re

text = """nu
Comprovante de
transferência
15 ABR 2026 - 20:21:23
Valor
Tipo de transferência
R$ 205,00
Destino
Nome
Instituição
Agência
Conta
Tipo de conta
Origem
Nome
Instituição
Agência
Conta
CPF
Aparecida Ferreira dos Santos
NU PAGAMENTOS - IP
0001
16314960-0
Conta corrente
Gabriel Ferreira dos Santos Silva
NU PAGAMENTOS • IP
0001
6705868-2
....009.681
Nu Pagamentos S.A. • Instituição de
Pagamento
CNPJ 18.236.120/0001-58
ID da transação:
El 8236120202604152321s03209290e5
Estamos aqui para ajudar se você tiver alguma
dúvida,"""

val_match = re.search(r'R\$\s*([\d\.,]+)', text)
print("Val:", val_match.group(1) if val_match else None)

dest_match = re.search(r'Destino\s*\n\s*Nome\s*\n([^\n]+)|Nome\s*\n([^\n]+)', text, re.IGNORECASE)
if dest_match:
    print("Dest:", dest_match.group(1) or dest_match.group(2))

id_match = re.search(r'ID da transação[:\s]*\n?([A-Za-z0-9]+)', text, re.IGNORECASE)
if id_match:
    print("ID:", id_match.group(1))

