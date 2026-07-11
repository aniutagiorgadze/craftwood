# Craftwood

ავეჯის ფოტო გალერეა GitHub Pages-ზე, ადმინ პანელით სურათების ატვირთვისთვის.

## GitHub-ზე ატვირთვა

### 1. რეპოზიტორიის შექმნა

1. გადადით [github.com/new](https://github.com/new)
2. Repository name: `craftwood`
3. Public რეპოზიტორია
4. **არ** დაამატოთ README (უკვე გვაქვს)
5. დააჭირეთ **Create repository**

### 2. კოდის ატვირთვა

ტერმინალში:

```bash
cd ~/Projects/craftwood

# შეცვალეთ YOUR_USERNAME თქვენი GitHub მომხმარებლის სახელით
git remote add origin https://github.com/aniutagiorgadze/craftwood.git
git add .
git commit -m "Initial Craftwood gallery site"
git push -u origin main
```

### 3. GitHub Pages ჩართვა

1. რეპოზიტორიაში: **Settings → Pages**
2. **Source**: GitHub Actions
3. რამდენიმე წუთში საიტი გამოჩნდება: `https://aniutagiorgadze.github.io/craftwood/`

### 4. კონფიგურაცია

შეცვალეთ `js/config.js`:

```js
window.CRAFTWOOD_CONFIG = {
  repo: 'aniutagiorgadze/craftwood',
  branch: 'main',
};
```

შეცვალეთ კონტაქტი `index.html`-ში (#contact სექცია).

---

## ადმინ პანელი — ფოტოების ატვირთვა

გახსენით: `https://aniutagiorgadze.github.io/craftwood/admin/`

### GitHub Token-ის შექმნა

1. [GitHub → Settings → Developer settings → Fine-grained tokens](https://github.com/settings/tokens?type=beta)
2. **Generate new token**
3. Repository access: მხოლოდ `craftwood`
4. Permissions: **Contents → Read and write**
5. დააკოპირეთ ტოკენი

### ატვირთვა

1. ადმინ გვერდზე შეიყვანეთ ტოკენი და რეპოზიტორია (`username/craftwood`)
2. აირჩიეთ ფოტო, სათაური და კატეგორია
3. დააჭირეთ **ატვირთვა**
4. 1–2 წუთში საიტი ავტომატურად განახლდება

ტოკენი ინახება მხოლოდ ბრაუზერის სესიაში და არ იგზავნება სხვა სერვერზე.

---

## ლოკალური გაშვება

```bash
cd ~/Projects/craftwood
python3 -m http.server 8080
```

- საიტი: http://localhost:8080
- ადმინი: http://localhost:8080/admin/

## სტრუქტურა

```
craftwood/
├── index.html          # მთავარი საიტი
├── admin/              # ადმინ პანელი
├── data/gallery.json   # გალერეის მონაცემები
├── images/uploads/     # ატვირთული ფოტოები
├── js/config.js        # რეპოზიტორიის კონფიგი
└── .github/workflows/  # GitHub Pages დეპლოი
```
